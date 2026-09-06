import type {
  Chapter,
  CleanOptions,
  IndexParseOptions,
  StoryMeta,
} from "./types";
import { collapseWhitespace, normalize } from "./text";

/** Matched accent-insensitively against both URL slugs (hyphenated) and anchor text (spaced). */
const CHAPTER_KEYWORDS = [
  "chuong",
  "chap",
  "chapter",
  "phien-ngoai",
  "ngoai-truyen",
  "vi-thanh",
];

const KEYWORD_VARIANTS = [
  ...new Set(
    CHAPTER_KEYWORDS.flatMap((keyword) => [
      keyword,
      keyword.split("-").join(" "),
    ]),
  ),
];

/**
 * In broad discovery mode keyword filtering cannot reject these, so archive
 * listings, feeds, admin endpoints and asset files are excluded up front.
 */
const NON_CONTENT_PATH = [
  /^\/(?:author|category|date|feed|page|tag|trackback|type|wp-admin|wp-content|wp-json|wp-login\.php|xmlrpc\.php)(?:\/|$)/i,
  /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|rar|svg|ttf|webm|webp|woff2?|xml|zip)(?:\?|$)/i,
];

function isNonContentLink(url: string): boolean {
  const { pathname } = new URL(url);
  if (pathname === "/") return true;
  return NON_CONTENT_PATH.some((pattern) => pattern.test(pathname));
}

/**
 * Canonical identity of a link: host + path without its trailing slash. Query
 * strings and hashes are ignored so `?share=`, `?fbclid=…` and `#` variants of
 * one URL collapse into a single chapter.
 */
function linkKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return stripTrailingSlash(parsed.toString()).toLowerCase();
  } catch {
    return url;
  }
}

/** Detached copy of the element with chrome nodes removed. */
function withoutJunk(source: Element): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const selector of JUNK_SELECTORS) {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  }
  return clone;
}

/** Drops short list items/paragraphs that name a chapter ("Chương 12"). */
function removeShortChapterLabels(root: HTMLElement): void {
  root.querySelectorAll("li, p").forEach((node) => {
    const text = collapseWhitespace(node.textContent ?? "");
    if (text && text.length < 120 && isChapterLink("", text)) node.remove();
  });
}

/**
 * Numbered indexes pack many chapters into one paragraph, so whole list items or
 * paragraphs that carry a chapter link are dropped rather than leaving a wall of
 * stray numbers in the exported synopsis.
 */
function removeChapterCarriers(
  root: HTMLElement,
  baseUrl: string,
  chapters: Chapter[],
): void {
  const chapterKeys = new Set(chapters.map((chapter) => linkKey(chapter.url)));
  root.querySelectorAll("li, p").forEach((node) => {
    const carriesChapter = Array.from(node.querySelectorAll("a[href]")).some(
      (anchor) =>
        chapterKeys.has(
          linkKey(resolveUrl(anchor.getAttribute("href"), baseUrl) ?? ""),
        ),
    );
    if (carriesChapter) node.remove();
  });
}

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

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/** Most specific container first; the fallback list is never fully relied on. */
const CONTENT_SELECTORS = [
  "article .entry-content",
  "article",
  ".entry-content",
  ".post-content",
  "main",
  "#content",
];

/**
 * The bare `h1` fallback must come last: modern themes print the site name in an
 * earlier `h1`, which would otherwise win over the post title.
 */
const TITLE_SELECTORS = [
  "h1.entry-title",
  ".entry-title",
  "h1.wp-block-post-title",
  ".wp-block-post-title",
  ".post-title",
  "article h1",
  "main h1",
  "#content h1",
  "h1",
  "title",
];

const parser = new DOMParser();

export function parseHtml(html: string): Document {
  return parser.parseFromString(html, "text/html");
}

/**
 * WordPress serves a password form instead of the post text when the post is
 * protected; the scraper keeps such chapters and exports a link to them.
 */
const PASSWORD_SELECTORS = [
  ".post-password-form",
  "form[class*='post-password']",
  'input[name="post_password"]',
  '.entry-content input[type="password"]',
];

export function isPasswordProtectedPage(doc: Document): boolean {
  return PASSWORD_SELECTORS.some(
    (selector) => doc.querySelector(selector) !== null,
  );
}

/** Localized prefixes WordPress prepends to protected post titles. */
function stripProtectedPrefix(title: string): string {
  return title
    .replace(/^(protected|bảo vệ|bao ve|khóa|khoa)\s*:\s*/i, "")
    .trim();
}

export function findArticle(doc: Document): Element | null {
  for (const selector of CONTENT_SELECTORS) {
    const found = doc.querySelector(selector);
    if (found?.textContent?.trim()) return found;
  }
  return doc.body;
}

export function extractTitle(doc: Document): string {
  for (const selector of TITLE_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return collapseWhitespace(text);
  }
  return "Untitled";
}

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

/**
 * Resolves URLs, strips junk nodes and unknown attributes. Returns a detached
 * clone; the source document is left untouched.
 */
export function cleanContent(
  source: Element,
  baseUrl: string,
  options: { stripImages: boolean; stripLinks: boolean },
): HTMLElement {
  const root = withoutJunk(source);

  // Resolve while the elements still exist, before any unwrapping runs.
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const resolved = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (resolved) anchor.setAttribute("href", resolved);
    else anchor.removeAttribute("href");
  });

  root.querySelectorAll("img").forEach((img) => {
    // WordPress lazy-loads via data-* attributes; those beat the placeholder src.
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
    const allowed = ALLOWED_ATTRS[element.tagName.toLowerCase()] ?? [];
    for (const attr of Array.from(element.attributes)) {
      if (!allowed.includes(attr.name)) element.removeAttribute(attr.name);
    }
    Array.from(element.children).forEach(walk);
  };
  Array.from(root.children).forEach(walk);
  for (const attr of Array.from(root.attributes)) {
    root.removeAttribute(attr.name);
  }
}

function removeEmptyBlocks(root: HTMLElement): void {
  root.querySelectorAll("p, div, span, section").forEach((node) => {
    const hasText = (node.textContent ?? "").replace(/\u00a0/g, " ").trim();
    const hasMedia = node.querySelector("img, br, hr, table");
    if (!hasText && !hasMedia) node.remove();
  });
}

export function resolveUrl(
  href: string | null | undefined,
  baseUrl: string,
): string | null {
  const trimmed = href?.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(javascript|mailto|tel):/i.test(trimmed)
  ) {
    return null;
  }
  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parseChapterNumber(url: string, text: string): number | null {
  const normalized = normalize(safeDecode(url));
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
  const haystack = `${normalize(safeDecode(url))} ${normalize(text)}`;
  return KEYWORD_VARIANTS.some((keyword) => haystack.includes(keyword));
}

/** decodeURIComponent throws on malformed escapes, which a stray href can contain. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Finds chapter links in the index content, in document order, deduplicated by
 * URL. In broad mode every same-site post link counts — numbered indexes
 * ("1 2 3 …") carry no keyword at all; otherwise only links that match a chapter
 * keyword are kept. Broad mode scans a chrome-free copy so the entry header,
 * sidebars and share buttons cannot leak unrelated links in.
 */
export function extractChapterLinks(
  article: Element,
  baseUrl: string,
  includeAllLinks: boolean,
): Chapter[] {
  const origin = safeOrigin(baseUrl);
  const indexKey = linkKey(baseUrl);
  const scope = includeAllLinks ? withoutJunk(article) : article;
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  scope.querySelectorAll("a[href]").forEach((anchor) => {
    const url = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (!url || seen.has(linkKey(url))) return;

    const linkText = collapseWhitespace(anchor.textContent ?? "");
    if (origin && safeOrigin(url) !== origin) return;
    // An index may link to itself from a "back to top" anchor, a share button or
    // a menu entry — that is never a chapter.
    if (linkKey(url) === indexKey) return;

    if (includeAllLinks) {
      if (!linkText || isNonContentLink(url)) return;
    } else if (!isChapterLink(url, linkText)) {
      return;
    }

    seen.add(linkKey(url));
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

/**
 * Orders by parsed chapter number only when every chapter has one; a single
 * unnumbered chapter keeps the whole list in document order.
 */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.some((chapter) => chapter.order === null)) return chapters;
  return [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function countWords(html: string): number {
  const text = parseHtml(`<div>${html}</div>`).body.textContent ?? "";
  return text.trim().match(/\S+/g)?.length ?? 0;
}

export function parseIndexPage(
  html: string,
  finalUrl: string,
  options: IndexParseOptions,
): { meta: StoryMeta; chapters: Chapter[] } {
  const doc = parseHtml(html);
  const article = findArticle(doc);
  if (!article) {
    throw new Error(
      "Không tìm thấy phần nội dung <article> trên trang mục lục.",
    );
  }

  const chapters = sortChapters(
    extractChapterLinks(article, finalUrl, options.includeAllLinks),
  );

  // The synopsis is the article minus its chapter list, so the exported
  // description page is not a wall of links.
  const synopsisSource = article.cloneNode(true) as HTMLElement;
  if (options.includeAllLinks) {
    removeChapterCarriers(synopsisSource, finalUrl, chapters);
  } else {
    removeShortChapterLabels(synopsisSource);
  }
  removeEmptyBlocks(synopsisSource);

  const description = cleanContent(synopsisSource, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: true,
  });

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

/**
 * Empty when the page names no usable title, so exporters fall back to the index
 * link text ("Chương 12") instead of an arbitrary page heading.
 */
function chapterTitle(doc: Document): string {
  const title = stripProtectedPrefix(extractTitle(doc));
  return title && title.toLowerCase() !== "untitled" ? title : "";
}

export function parseChapterPage(
  html: string,
  finalUrl: string,
  options: CleanOptions,
): { title: string; html: string; protected: boolean } {
  const doc = parseHtml(html);

  // A protected page has no story text; callers export a link to the original.
  if (isPasswordProtectedPage(doc)) {
    return { title: chapterTitle(doc), html: "", protected: true };
  }

  const article = findArticle(doc);
  if (!article) throw new Error("Không tìm thấy phần tử <article>.");

  const cleaned = cleanContent(article, finalUrl, {
    stripImages: options.stripImages,
    stripLinks: true,
  });
  const body = cleaned.innerHTML.trim();
  if (!body) throw new Error("Phần tử <article> rỗng sau khi làm sạch.");

  return { title: chapterTitle(doc), html: body, protected: false };
}
