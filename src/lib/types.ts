export type ChapterStatus =
  "pending" | "fetching" | "done" | "failed" | "skipped";

/** A chapter link discovered on the index page, plus its scrape result once fetched. */
export interface Chapter {
  id: string;
  url: string;
  /** Anchor text from the index page — used as a fallback title. */
  linkText: string;
  /** Leading number parsed out of the URL/anchor text, used for sorting. */
  order: number | null;
  selected: boolean;
  status: ChapterStatus;
  /** Title taken from the chapter page itself once fetched. */
  title?: string;
  /** Cleaned inner HTML of the page's <article> element. */
  html?: string;
  wordCount?: number;
  error?: string;
}

export interface StoryMeta {
  title: string;
  author: string;
  language: string;
  /** Cleaned HTML of the index page, minus the chapter list — used as a synopsis. */
  descriptionHtml: string;
  sourceUrl: string;
}

export interface ScrapeOptions {
  /** Drop <img> elements from chapter bodies. The only user-facing toggle. */
  stripImages: boolean;
  /** Parallel chapter fetches. */
  concurrency: number;
  /** Delay in ms between the start of each fetch, to stay polite. */
  delayMs: number;
  /** Attempts per chapter before giving up. */
  retries: number;
}

/** The subset of options that content cleaning actually depends on. */
export type CleanOptions = Pick<ScrapeOptions, "stripImages">;

export interface LogEntry {
  id: number;
  at: number;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

/** Result of a proxied fetch, carrying the post-redirect URL for link resolution. */
export interface FetchedDocument {
  html: string;
  finalUrl: string;
}

/** Supplies raw image bytes to an exporter. Shared by the EPUB and PDF builders. */
export type ImageFetcher = (
  url: string,
) => Promise<{ data: Uint8Array; mimeType: string }>;

/** Progress reporting common to both exporters. */
export interface ExportHooks {
  /** Replaces the current busy message; fires often. */
  onStatus?: (message: string) => void;
  /** A recoverable problem worth showing in the log, e.g. a skipped image. */
  onWarning?: (message: string) => void;
}
