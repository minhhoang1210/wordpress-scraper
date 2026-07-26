import {
  FIXED,
  type Chapter,
  type ScrapeOptions,
  type StoryMeta,
} from "./types";

/**
 * A link is treated as a chapter when its href or anchor text contains one of these
 * markers. Text is compared with diacritics stripped, so "Chương 12", "chuong-12",
 * "Phiên ngoại 3" and "phien-ngoai-3" all match the same keyword.
 */
export const CHAPTER_KEYWORDS = [
  "chuong",
  "chap",
  "chapter",
  "phien-ngoai",
  "ngoai-truyen",
  "vi-thanh",
];

/** Elements that are chrome rather than story content on a WordPress post. */
const JUNK_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "form",
  "button",
  "svg",
  "link",
  "meta",
  "nav",
  "footer",
  "header.entry-header",
  ".entry-meta",
  ".entry-footer",
  ".post-navigation",
  ".nav-links",
  ".navigation",
  ".sharedaddy",
  ".sd-block",
  ".sd-sharing",
  ".sd-social",
  ".jp-relatedposts",
  "#jp-post-flair",
  ".jp-relatedposts-headline",
  ".wpcnt",
  ".wpa",
  ".comments-area",
  "#comments",
  "#respond",
  ".comment-respond",
  ".pd-rating",
  ".wp-polls",
  ".sharing-hidden",
  ".reblog-post",
  ".crayon-toolbar",
  '[aria-hidden="true"].screen-reader-text',
];

/** Attributes kept when sanitising; everything else is dropped. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

const parser = new DOMParser();

export function parseHtml(html: string): Document {
  return parser.parseFromString(html, "text/html");
}

/** Lowercases and removes Vietnamese diacritics so keyword matching is accent-insensitive. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Finds the page's main content container, preferring the semantic <article>. */
export function findArticle(doc: Document): Element | null {
  const candidates = [
    "article .entry-content",
    "article",
    ".entry-content",
    ".post-content",
    "main",
    "#content",
  ];

  for (const selector of candidates) {
    const found = doc.querySelector(selector);
    if (found && found.textContent && found.textContent.trim().length > 0)
      return found;
  }
  return doc.body;
}

export function extractTitle(doc: Document): string {
  const selectors = [
    "h1.entry-title",
    ".entry-title",
    "article h1",
    "h1",
    "title",
  ];
  for (const selector of selectors) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return collapseWhitespace(text);
  }
  return "Untitled";
}

/** Returns an empty string when the page names no author; callers omit the field entirely. */
export function extractAuthor(doc: Document): string {
  const meta =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ??
    doc
      .querySelector('meta[property="article:author"]')
      ?.getAttribute("content") ??
    doc.querySelector('.author .fn, .byline .author, a[rel="author"]')
      ?.textContent;
  return collapseWhitespace(meta ?? "");
}

export function extractLanguage(doc: Document): string {
  const lang = doc.documentElement.getAttribute("lang");
  return lang ? lang.split("-")[0] : "en";
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Rewrites relative hrefs/srcs to absolute, strips junk nodes and unknown attributes.
 * Mutates and returns a detached clone — the source document is left untouched.
 */
export function cleanContent(
  source: Element,
  baseUrl: string,
  options: { stripImages: boolean; stripLinks: boolean },
): HTMLElement {
  const root = source.cloneNode(true) as HTMLElement;

  for (const selector of JUNK_SELECTORS) {
    root.querySelectorAll(selector).forEach((node) => node.remove());
  }

  // Resolve URLs before anything is unwrapped, while the elements still exist.
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const resolved = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (resolved) anchor.setAttribute("href", resolved);
    else anchor.removeAttribute("href");
  });

  root.querySelectorAll("img").forEach((img) => {
    // WordPress lazy-loads via data-src / data-orig-file; prefer those over a placeholder.
    const candidate =
      img.getAttribute("data-orig-file") ??
      img.getAttribute("data-large-file") ??
      img.getAttribute("data-src") ??
      img.getAttribute("src");
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved) img.setAttribute("src", resolved);
    else img.remove();
  });

  if (options.stripImages) {
    root
      .querySelectorAll("img, figure, picture")
      .forEach((node) => node.remove());
  }

  if (options.stripLinks) {
    root.querySelectorAll("a").forEach((anchor) => {
      anchor.replaceWith(...Array.from(anchor.childNodes));
    });
  }

  stripAttributes(root);
  removeEmptyBlocks(root);

  return root;
}

function stripAttributes(root: HTMLElement): void {
  const walk = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    const allowed = ALLOWED_ATTRS[tag] ?? [];
    for (const attr of Array.from(element.attributes)) {
      if (!allowed.includes(attr.name)) element.removeAttribute(attr.name);
    }
    Array.from(element.children).forEach(walk);
  };
  Array.from(root.children).forEach(walk);
  for (const attr of Array.from(root.attributes))
    root.removeAttribute(attr.name);
}

/** Drops paragraphs/divs that hold neither text nor media, a common WP artifact. */
function removeEmptyBlocks(root: HTMLElement): void {
  root.querySelectorAll("p, div, span, section").forEach((node) => {
    const hasText =
      (node.textContent ?? "").replace(/ /g, " ").trim().length > 0;
    const hasMedia = node.querySelector("img, br, hr, table");
    if (!hasText && !hasMedia) node.remove();
  });
}

export function resolveUrl(
  href: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(javascript|mailto|tel):/i.test(trimmed)
  )
    return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Pulls the first standalone number out of a URL slug or anchor text, for ordering. */
export function parseChapterNumber(url: string, text: string): number | null {
  const normalized = normalize(decodeURIComponent(url));
  const patterns = [
    /(?:chuong|chapter|chap|phien-ngoai|ngoai-truyen|vi-thanh)[-_\s]*(\d+(?:\.\d+)?)/,
    /\/(\d+(?:\.\d+)?)\/?$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number.parseFloat(match[1]);
  }

  const fromText = normalize(text).match(
    /(?:chuong|chapter|chap|phien ngoai|ngoai truyen|vi thanh)\s*(\d+(?:\.\d+)?)/,
  );
  return fromText ? Number.parseFloat(fromText[1]) : null;
}

export function isChapterLink(url: string, text: string): boolean {
  const haystack = `${normalize(decodeURIComponent(url))} ${normalize(text)}`;
  return CHAPTER_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/**
 * Collects chapter links from the index page's article, in document order,
 * deduplicated by URL.
 */
export function extractChapterLinks(
  article: Element,
  baseUrl: string,
  sameOriginOnly: boolean,
): Chapter[] {
  const origin = safeOrigin(baseUrl);
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  article.querySelectorAll("a[href]").forEach((anchor) => {
    const url = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || seen.has(url)) return;

    const linkText = collapseWhitespace(anchor.textContent ?? "");
    if (!isChapterLink(url, linkText)) return;
    if (sameOriginOnly && origin && safeOrigin(url) !== origin) return;
    // The index page often links to itself from a "table of contents" anchor.
    if (stripTrailingSlash(url) === stripTrailingSlash(baseUrl)) return;

    seen.add(url);
    chapters.push({
      id: `ch-${chapters.length}`,
      url,
      linkText: linkText || url,
      order: parseChapterNumber(url, linkText),
      selected: true,
      status: "pending",
    });
  });

  return chapters;
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Sorts by parsed chapter number when every entry has one; otherwise keeps page order. */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.some((chapter) => chapter.order === null)) return chapters;
  return [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function countWords(html: string): number {
  const text = parseHtml(`<div>${html}</div>`).body.textContent ?? "";
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Parses the index page into story metadata plus its chapter links. */
export function parseIndexPage(
  html: string,
  finalUrl: string,
  options: ScrapeOptions,
): { meta: StoryMeta; chapters: Chapter[] } {
  const doc = parseHtml(html);
  const article = findArticle(doc);
  if (!article)
    throw new Error(
      "Không tìm thấy phần nội dung <article> trên trang mục lục.",
    );

  const chapters = extractChapterLinks(article, finalUrl, FIXED.sameOriginOnly);

  // The synopsis is the article with the chapter links removed, so the EPUB's
  // description page isn't just a wall of dead links.
  const description = cleanContent(article, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: true,
  });
  description.querySelectorAll("li, p").forEach((node) => {
    const text = collapseWhitespace(node.textContent ?? "");
    if (text && isChapterLink("", text) && text.length < 120) node.remove();
  });
  removeEmptyBlocks(description);

  return {
    meta: {
      title: extractTitle(doc),
      author: extractAuthor(doc),
      language: extractLanguage(doc),
      descriptionHtml: description.innerHTML,
      sourceUrl: finalUrl,
    },
    chapters,
  };
}

/** Parses a chapter page into its title and cleaned body HTML. */
export function parseChapterPage(
  html: string,
  finalUrl: string,
  options: ScrapeOptions,
): { title: string; html: string } {
  const doc = parseHtml(html);
  const article = findArticle(doc);
  if (!article) throw new Error("Không tìm thấy phần tử <article>.");

  const cleaned = cleanContent(article, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: FIXED.stripLinks,
  });
  const body = cleaned.innerHTML.trim();
  if (!body) throw new Error("Phần tử <article> rỗng sau khi làm sạch.");

  return { title: extractTitle(doc), html: body };
}
