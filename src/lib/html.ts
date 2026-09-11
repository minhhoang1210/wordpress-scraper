import { resolveUrl } from "./url";

const domParser = new DOMParser();

const NON_BREAKING_SPACE = /\u00a0/g;

const STRUCTURAL_JUNK = [
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
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height"],
  ol: ["start"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

/** WordPress lazy-loads through data-* attributes that beat the placeholder src. */
const IMAGE_SOURCE_ATTRIBUTES = [
  "data-orig-file",
  "data-large-file",
  "data-src",
  "src",
];

export function parseHtml(html: string): Document {
  return domParser.parseFromString(html, "text/html");
}

export function parseFragment(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

export function countWords(html: string): number {
  return parseFragment(html).textContent?.trim().match(/\S+/g)?.length ?? 0;
}

export function withoutJunk(
  source: Element,
  extraSelectors: readonly string[] = [],
): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const selector of [...STRUCTURAL_JUNK, ...extraSelectors]) {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  }
  return clone;
}

export interface SanitizeOptions {
  baseUrl: string;
  stripImages: boolean;
  stripLinks: boolean;
  junkSelectors?: readonly string[];
}

/**
 * Turns source markup into the small tag vocabulary the exporters understand:
 * absolute URLs, no junk nodes, no attributes outside the allow-list. Returns a
 * detached clone; the source document is left untouched.
 */
export function sanitize(
  source: Element,
  options: SanitizeOptions,
): HTMLElement {
  const root = withoutJunk(source, options.junkSelectors);

  absolutizeLinks(root, options.baseUrl);
  absolutizeImages(root, options.baseUrl);

  if (options.stripImages) removeImages(root);
  if (options.stripLinks) unwrapLinks(root);

  stripUnknownAttributes(root);
  removeEmptyBlocks(root);

  return root;
}

function absolutizeLinks(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const resolved = resolveUrl(anchor.getAttribute("href"), baseUrl);
    if (resolved) anchor.setAttribute("href", resolved);
    else anchor.removeAttribute("href");
  });
}

function absolutizeImages(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("img").forEach((image) => {
    const candidate = IMAGE_SOURCE_ATTRIBUTES.map((name) =>
      image.getAttribute(name),
    ).find(Boolean);
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved) image.setAttribute("src", resolved);
    else image.remove();
  });
}

function removeImages(root: HTMLElement): void {
  root
    .querySelectorAll("img, figure, picture")
    .forEach((node) => node.remove());
}

function unwrapLinks(root: HTMLElement): void {
  root.querySelectorAll("a").forEach((anchor) => {
    anchor.replaceWith(...Array.from(anchor.childNodes));
  });
}

function stripUnknownAttributes(root: HTMLElement): void {
  const walk = (element: Element) => {
    const allowed = ALLOWED_ATTRIBUTES[element.tagName.toLowerCase()] ?? [];
    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
    Array.from(element.children).forEach(walk);
  };

  Array.from(root.children).forEach(walk);
  for (const attribute of Array.from(root.attributes)) {
    root.removeAttribute(attribute.name);
  }
}

export function removeEmptyBlocks(root: HTMLElement): void {
  root.querySelectorAll("p, div, span, section").forEach((node) => {
    const hasText = (node.textContent ?? "")
      .replace(NON_BREAKING_SPACE, " ")
      .trim();
    const hasMedia = node.querySelector("img, br, hr, table");
    if (!hasText && !hasMedia) node.remove();
  });
}
