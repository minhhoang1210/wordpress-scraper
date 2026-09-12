import { sleep } from "../../async";
import { parseFragment, sanitize } from "../../html";
import type { Chapter, StoryMeta } from "../../types";
import { textToParagraphs } from "../../text";
import { requestOptions } from "../request";
import {
  UNTITLED_STORY,
  type ChapterContent,
  type DownloadContext,
  type FetchPolicy,
  type StoryIndex,
  type StorySession,
  type StorySource,
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

/**
 * A long part is served in pages, and those requests do not go through the
 * chapter pool, so they need their own spacing or one chapter alone can burst
 * dozens of calls at Wattpad.
 */
const FETCH_POLICY: FetchPolicy = { concurrency: 2, delayMs: 400, retries: 3 };

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
        `Truyện có ${story.numParts} chương nhưng chỉ lấy được ${parts.length}, số còn lại là bản nháp hoặc đã bị xoá.`,
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
        `${chapter.label}: Wattpad không trả về nội dung, có thể chương này bị khoá hoặc thuộc bản trả phí.`,
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
      if (page > 1) await sleep(FETCH_POLICY.delayMs);
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
      requestOptions(context, "thông tin chương"),
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
    context.warn(
      `Không biết mã ngôn ngữ của “${languageName}”, tạm dùng “en”.`,
    );
  }

  return {
    title: story.title?.trim() || UNTITLED_STORY,
    author: story.user?.name?.trim() || story.user?.username?.trim() || "",
    language: language ?? "en",
    descriptionHtml: textToParagraphs(story.description ?? ""),
    sourceUrl: story.url ?? requestedUrl,
    coverUrl: story.cover?.replace(COVER_WIDTH, "-512-"),
  };
}

export const wattpadSource: StorySource = {
  id: "wattpad",
  name: "Wattpad",
  urlPlaceholder: "https://www.wattpad.com/story/123456789-ten-truyen",
  urlHint: "Dán liên kết truyện hoặc liên kết một chương bất kỳ.",
  fetchPolicy: FETCH_POLICY,
  createSession: () => new WattpadSession(),
};
