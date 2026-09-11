import { parseHtml } from "../../html";
import { collapseWhitespace } from "../../text";
import { resolveUrl } from "../../url";

export const THEME_JUNK = [
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

/** WordPress serves a password form in place of the post text when protected. */
const PASSWORD_SELECTORS = [
  ".post-password-form",
  "form[class*='post-password']",
  'input[name="post_password"]',
  '.entry-content input[type="password"]',
];

const PASSWORD_FORM_SELECTOR =
  ".post-password-form, form[class*='post-password'], form[action*='postpass']";

/** Localized prefixes WordPress prepends to protected post titles. */
const PROTECTED_PREFIX = /^(protected|bảo vệ|bao ve|khóa|khoa)\s*:\s*/i;

export function findArticle(doc: Document): Element {
  for (const selector of CONTENT_SELECTORS) {
    const found = doc.querySelector(selector);
    if (found?.textContent?.trim()) return found;
  }
  return doc.body;
}

/** Empty when the page names no title of its own. */
export function readTitle(doc: Document): string {
  for (const selector of TITLE_SELECTORS) {
    const text = doc.querySelector(selector)?.textContent?.trim();
    if (text) return collapseWhitespace(text);
  }
  return "";
}

export function readAuthor(doc: Document): string {
  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ??
    doc
      .querySelector('meta[property="article:author"]')
      ?.getAttribute("content") ??
    doc.querySelector('.author .fn, .byline .author, a[rel="author"]')
      ?.textContent;
  return collapseWhitespace(author ?? "");
}

export function readLanguage(doc: Document): string {
  const lang = doc.documentElement.getAttribute("lang");
  return lang ? lang.split("-")[0] : "en";
}

/**
 * Empty when the page names no usable title, so exporters fall back to the index
 * label ("Chương 12") instead of an arbitrary page heading. "Untitled" is
 * WordPress's own placeholder, never a real chapter title.
 */
export function readChapterTitle(doc: Document): string {
  const title = readTitle(doc).replace(PROTECTED_PREFIX, "").trim();
  return title.toLowerCase() === "untitled" ? "" : title;
}

export function isPasswordProtected(doc: Document): boolean {
  return PASSWORD_SELECTORS.some(
    (selector) => doc.querySelector(selector) !== null,
  );
}

/** Absolute action URL of the password form, or the blog's default postpass URL. */
export function findPasswordFormAction(
  html: string,
  baseUrl: string,
): string | null {
  const action = parseHtml(html)
    .querySelector(PASSWORD_FORM_SELECTOR)
    ?.getAttribute("action");
  const resolved = action ? resolveUrl(action, baseUrl) : null;
  if (resolved) return resolved;

  try {
    return `${new URL(baseUrl).origin}/wp-login.php?action=postpass`;
  } catch {
    return null;
  }
}
