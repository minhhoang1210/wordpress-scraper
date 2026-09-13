import type { RateGate } from "../async";
import type { Chapter, ScrapeSettings, StoryMeta } from "../types";

export type SourceId = "wordpress" | "wattpad";

export const UNTITLED_STORY = "Truyện không tên";

/** An optional secret the reader types in to unlock content on a source. */
export interface CredentialField {
  label: string;
  placeholder: string;
  hint: string;
}

/** Chapters run in parallel by the reader's own setting, not by source. */
export interface FetchPolicy {
  delayMs: number;
  retries: number;
}

export interface StoryIndex {
  meta: StoryMeta;
  chapters: Chapter[];
}

export interface ChapterContent {
  /** A better title than the index gave, or "" to keep the index label. */
  title: string;
  html: string;
  locked: boolean;
}

export interface DownloadContext extends ScrapeSettings {
  signal: AbortSignal;
  retries: number;
  /** One per download run; a 429 anywhere pauses the whole run. */
  gate: RateGate;
  credential: string;
  warn: (message: string) => void;
  notice: (message: string) => void;
}

/**
 * One story's downloads. Sources keep per-story caches here (unlock cookies,
 * chapter metadata) so nothing leaks between stories.
 */
export interface StorySession {
  loadIndex(url: string, context: DownloadContext): Promise<StoryIndex>;
  loadChapter(
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<ChapterContent>;
}

export interface StorySource {
  readonly id: SourceId;
  readonly name: string;
  readonly urlPlaceholder: string;
  readonly urlHint: string;
  readonly fetchPolicy: FetchPolicy;
  readonly credentialField?: CredentialField;
  createSession(): StorySession;
}
