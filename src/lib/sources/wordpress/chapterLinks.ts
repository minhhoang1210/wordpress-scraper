import type { Chapter } from "../../types";
import { withoutJunk } from "../../html";
import { collapseWhitespace, normalize } from "../../text";
import { linkKey, originOf, resolveUrl, safeDecode } from "../../url";
import { THEME_JUNK } from "./page";

/**
 * Keyword filtering cannot reject these, so archive listings, feeds, admin
 * endpoints and asset files are excluded up front.
 */
const NON_CONTENT_PATHS = [
  /^\/(?:author|category|date|feed|page|tag|trackback|type|wp-admin|wp-content|wp-json|wp-login\.php|xmlrpc\.php)(?:\/|$)/i,
  /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|rar|svg|ttf|webm|webp|woff2?|xml|zip)(?:\?|$)/i,
];

const NUMBER_IN_URL = [
  /(?:chuong|chapter|chap|phien-ngoai|ngoai-truyen|vi-thanh)[-_\s]*(\d+(?:\.\d+)?)/,
  /\/(\d+(?:\.\d+)?)\/?$/,
];

const NUMBER_IN_TEXT =
  /(?:chuong|chapter|chap|phien ngoai|ngoai truyen|vi thanh)\s*(\d+(?:\.\d+)?)/;

/**
 * Chapter links in the index content, in document order, deduplicated by URL.
 * Every same-site post link counts — numbered indexes ("1 2 3 …") carry no
 * keyword at all — while chrome links are filtered out. The scan runs on a
 * chrome-free copy so headers, sidebars and share buttons cannot leak links in.
 */
export function findChapterLinks(article: Element, baseUrl: string): Chapter[] {
  const origin = originOf(baseUrl);
  const indexKey = linkKey(baseUrl);
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  withoutJunk(article, THEME_JUNK)
    .querySelectorAll("a[href]")
    .forEach((anchor) => {
      const url = resolveUrl(anchor.getAttribute("href"), baseUrl);
      const label = collapseWhitespace(anchor.textContent ?? "");
      if (!url || !label) return;

      const key = linkKey(url);
      // An index links to itself from "back to top" anchors and menu entries.
      if (seen.has(key) || key === indexKey) return;
      if (origin && originOf(url) !== origin) return;
      if (isNonContentLink(url)) return;

      seen.add(key);
      chapters.push({
        id: `ch-${chapters.length}`,
        url,
        label,
        order: parseChapterNumber(url, label),
        selected: true,
        status: "pending",
      });
    });

  return chapters;
}

function isNonContentLink(url: string): boolean {
  const { pathname } = new URL(url);
  if (pathname === "/") return true;
  return NON_CONTENT_PATHS.some((pattern) => pattern.test(pathname));
}

export function parseChapterNumber(url: string, label: string): number | null {
  const normalizedUrl = normalize(safeDecode(url));

  for (const pattern of NUMBER_IN_URL) {
    const match = normalizedUrl.match(pattern);
    if (match) return Number.parseFloat(match[1]);
  }

  const fromLabel = normalize(label).match(NUMBER_IN_TEXT);
  return fromLabel ? Number.parseFloat(fromLabel[1]) : null;
}

/**
 * Orders by parsed chapter number only when every chapter has one; a single
 * unnumbered chapter keeps the whole list in document order.
 */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.some((chapter) => chapter.order === null)) return chapters;
  return [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Numbered indexes pack many chapters into one paragraph, so whole list items or
 * paragraphs carrying a chapter link are dropped rather than leaving a wall of
 * stray numbers in the exported synopsis.
 */
export function removeChapterLists(
  root: HTMLElement,
  baseUrl: string,
  chapters: Chapter[],
): void {
  const chapterKeys = new Set(chapters.map((chapter) => linkKey(chapter.url)));

  root.querySelectorAll("li, p").forEach((node) => {
    const carriesChapter = Array.from(node.querySelectorAll("a[href]")).some(
      (anchor) => {
        const url = resolveUrl(anchor.getAttribute("href"), baseUrl);
        return url !== null && chapterKeys.has(linkKey(url));
      },
    );
    if (carriesChapter) node.remove();
  });
}
