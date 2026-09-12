import { escapeXml } from "./xhtml";

const DIACRITIC_MARKS = /[\u0300-\u036f]/g;
const VIETNAMESE_D = /đ/g;

/** Lower-cased and stripped of diacritics, for accent-insensitive matching. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .replace(VIETNAMESE_D, "d");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string, fallback = "truyen"): string {
  return (
    normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BLOCK_END = /<\/(p|div|h[1-6]|li)>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;

/** Flattens a description to editable plain text, keeping paragraph breaks. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const element = document.createElement("div");
  element.innerHTML = html.replace(BLOCK_END, "\n").replace(LINE_BREAK, "\n");
  return (element.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Turns edited plain text back into the paragraph markup exports expect. */
export function textToParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeXml(line)}</p>`)
    .join("");
}
