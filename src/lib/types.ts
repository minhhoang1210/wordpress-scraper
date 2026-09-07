export type ChapterStatus =
  "pending" | "fetching" | "done" | "failed" | "skipped";

/** A chapter link discovered on the index page, plus its scrape result. */
export interface Chapter {
  id: string;
  url: string;
  /** Anchor text from the index page — fallback title. */
  linkText: string;
  /** Chapter number parsed from the URL/anchor text, used for sorting. */
  order: number | null;
  selected: boolean;
  status: ChapterStatus;
  /** True when the page asks for a password; the book gets a link instead of content. */
  protected?: boolean;
  /** Title read from the chapter page itself once fetched. */
  title?: string;
  /** Cleaned inner HTML of the page's main content. */
  html?: string;
  wordCount?: number;
  error?: string;
}

export interface StoryMeta {
  title: string;
  author: string;
  language: string;
  /** Cleaned index content without the chapter list — used as the synopsis. */
  descriptionHtml: string;
  sourceUrl: string;
}

export interface ScrapeOptions {
  stripImages: boolean;
  /** Parallel chapter fetches. */
  concurrency: number;
  /** Pause between each fetch to stay polite to the source server. */
  delayMs: number;
  /** Attempts per chapter before giving up. */
  retries: number;
}

export type CleanOptions = Pick<ScrapeOptions, "stripImages">;

export type IndexParseOptions = Pick<ScrapeOptions, "stripImages">;

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

/** Supplies raw image bytes to an exporter. */
export type ImageFetcher = (
  url: string,
) => Promise<{ data: Uint8Array; mimeType: string }>;

/** Progress reporting shared by both exporters. */
export interface ExportHooks {
  onStatus?: (message: string) => void;
  onWarning?: (message: string) => void;
}
