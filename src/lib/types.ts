export type ChapterStatus = "pending" | "fetching" | "done" | "failed";

export interface Chapter {
  id: string;
  url: string;
  /** Title as the source's index lists it; the fallback when the body has none. */
  label: string;
  /** Display number, and the sort key when every chapter has one. */
  order: number | null;
  selected: boolean;
  status: ChapterStatus;
  /** Body unavailable (password, paywall); exports link to the original page. */
  locked?: boolean;
  /** Title read from the chapter body itself, when it offers a better one. */
  title?: string;
  html?: string;
  wordCount?: number;
  error?: string;
}

export interface StoryMeta {
  title: string;
  author: string;
  /** BCP-47 code for `dc:language`. */
  language: string;
  descriptionHtml: string;
  sourceUrl: string;
  /** Cover published by the source; exports prefer it over any other cover. */
  coverUrl?: string;
}

export interface ScrapeSettings {
  stripImages: boolean;
}

export interface LogEntry {
  id: number;
  at: number;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

/** A proxied page plus its post-redirect URL, so relative links resolve. */
export interface FetchedPage {
  html: string;
  finalUrl: string;
}

export type ImageFetcher = (
  url: string,
) => Promise<{ data: Uint8Array; mimeType: string }>;

export interface ExportHooks {
  onStatus?: (message: string) => void;
  onWarning?: (message: string) => void;
}
