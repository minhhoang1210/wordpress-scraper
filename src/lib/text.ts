/** Combining diacritical marks, stripped after an NFD decomposition. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Lowercases and removes Vietnamese diacritics, so comparisons are accent-insensitive:
 * "Chương 12" and "chuong-12" normalise to the same thing. `đ` needs its own rule
 * because it is a distinct letter rather than a base letter plus a mark.
 */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/g, "d");
}

/** Collapses all whitespace runs to single spaces and trims. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Builds a safe ASCII filename stem from a story title. */
export function slugify(value: string, fallback = "truyen"): string {
  return (
    normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

/** Renders a byte count for the activity log. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Normalises an unknown thrown value into a readable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
