import { runPool } from "../../async";
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

const FETCH_POLICY: FetchPolicy = { concurrency: 3, delayMs: 200, retries: 2 };

/** Higher and one long chapter on its own bursts at Wattpad. */
const PAGE_CONCURRENCY = 2;

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

  /** The index reports the page count, so the pages need not be read in turn. */
  private async loadPartBody(
    partId: number,
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<string> {
    const known = this.pageCountByPart.get(partId);
    if (!known) return this.probePartBody(partId, chapter, context);

    const pageCount = Math.min(known, MAX_PART_PAGES);
    const pages = new Array<string>(pageCount).fill("");

    await runPool(
      Array.from({ length: pageCount }, (_, index) => index),
      async (index) => {
        pages[index] = await fetchPartTextPage(
          partId,
          index + 1,
          requestOptions(context, chapter.label),
        );
      },
      { concurrency: PAGE_CONCURRENCY, signal: context.signal },
    );

    const gap = pages.findIndex((text) => !text.trim());
    return (gap === -1 ? pages : pages.slice(0, gap)).join("\n");
  }

  private async probePartBody(
    partId: number,
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<string> {
    const pages: string[] = [];

    for (let page = 1; page <= MAX_PART_PAGES; page++) {
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
