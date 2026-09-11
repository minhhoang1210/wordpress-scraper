import { parseFragment, sanitize } from "../../html";
import type { Chapter, StoryMeta } from "../../types";
import { escapeXml } from "../../xhtml";
import { requestOptions } from "../request";
import type {
  ChapterContent,
  DownloadContext,
  StoryIndex,
  StorySession,
  StorySource,
} from "../types";
import {
  fetchPartTextPage,
  fetchStory,
  fetchStoryIdForPart,
  type WattpadPart,
  type WattpadStory,
} from "./api";
import { languageCode } from "./language";
import { parseWattpadUrl, partIdFromUrl } from "./storyUrl";

/** Guards the page loop when a part reports no page count. */
const MAX_PART_PAGES = 50;

const COVER_WIDTH = /-256-/;

class WattpadSession implements StorySession {
  private readonly pageCountByPart = new Map<number, number>();

  async loadIndex(url: string, context: DownloadContext): Promise<StoryIndex> {
    const story = await fetchStory(
      await this.resolveStoryId(url, context),
      requestOptions(context, "thông tin truyện"),
    );

    const parts = (story.parts ?? []).filter((part) => !part.draft);
    for (const part of parts) {
      if (part.pages) this.pageCountByPart.set(part.id, part.pages);
    }

    if (story.numParts && parts.length < story.numParts) {
      context.warn(
        `Truyện có ${story.numParts} chương nhưng API chỉ trả về ${parts.length} — số còn lại là bản nháp hoặc đã bị xoá.`,
      );
    }

    return {
      meta: toStoryMeta(story, url, context),
      chapters: parts.map(toChapter),
    };
  }

  async loadChapter(
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<ChapterContent> {
    const partId = partIdFromUrl(chapter.url);
    if (partId === null) {
      throw new Error(`Không đọc được mã chương từ ${chapter.url}.`);
    }

    const body = await this.loadPartBody(partId, chapter, context);
    const html = body
      ? sanitize(parseFragment(body), {
          baseUrl: chapter.url,
          stripImages: context.stripImages,
          stripLinks: true,
        }).innerHTML.trim()
      : "";

    if (!html) {
      context.warn(
        `${chapter.label}: Wattpad không trả về nội dung — chương có thể bị khoá hoặc thuộc bản trả phí.`,
      );
      return { title: "", html: "", locked: true };
    }

    return { title: "", html, locked: false };
  }

  /** Long parts are served in pages; the first empty page marks the end. */
  private async loadPartBody(
    partId: number,
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<string> {
    const pageCount = Math.min(
      this.pageCountByPart.get(partId) ?? MAX_PART_PAGES,
      MAX_PART_PAGES,
    );
    const pages: string[] = [];

    for (let page = 1; page <= pageCount; page++) {
      const text = await fetchPartTextPage(
        partId,
        page,
        requestOptions(context, chapter.label),
      );
      if (!text.trim()) break;
      pages.push(text);
    }

    return pages.join("\n");
  }

  private async resolveStoryId(
    url: string,
    context: DownloadContext,
  ): Promise<string> {
    const target = parseWattpadUrl(url);
    if (target.kind === "story") return target.storyId;

    return fetchStoryIdForPart(
      target.partId,
      requestOptions(context, "mã truyện"),
    );
  }
}

function toChapter(part: WattpadPart, index: number): Chapter {
  return {
    id: `part-${part.id}`,
    url: part.url,
    label: part.title?.trim() || `Chương ${index + 1}`,
    order: index + 1,
    selected: true,
    status: "pending",
  };
}

function toStoryMeta(
  story: WattpadStory,
  requestedUrl: string,
  context: DownloadContext,
): StoryMeta {
  const languageName = story.language?.name;
  const language = languageCode(languageName);
  if (!language && languageName) {
    context.warn(`Chưa biết mã ngôn ngữ cho “${languageName}”, dùng “en”.`);
  }

  return {
    title: story.title?.trim() || "Untitled",
    author: story.user?.name?.trim() || story.user?.username?.trim() || "",
    language: language ?? "en",
    descriptionHtml: toParagraphs(story.description ?? ""),
    sourceUrl: story.url ?? requestedUrl,
    coverUrl: story.cover?.replace(COVER_WIDTH, "-512-"),
  };
}

/** Wattpad descriptions are plain text, so they have to be escaped, not embedded. */
function toParagraphs(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeXml(line)}</p>`)
    .join("");
}

export const wattpadSource: StorySource = {
  id: "wattpad",
  name: "Wattpad",
  urlPlaceholder: "https://www.wattpad.com/story/123456789-ten-truyen",
  urlHint:
    "Dán liên kết truyện hoặc liên kết một chương bất kỳ. Danh sách chương lấy trực tiếp từ API của Wattpad, đúng thứ tự tác giả đăng.",
  fetchPolicy: { concurrency: 3, delayMs: 200, retries: 2 },
  createSession: () => new WattpadSession(),
};
