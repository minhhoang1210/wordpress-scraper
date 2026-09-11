const DIACRITIC_MARKS = /[\u0300-\u036f]/g;
const VIETNAMESE_D = /đ/g;

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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Splits a `|`-separated password box into the passwords to try, in order. */
export function splitPasswords(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split("|")) {
    const password = part.trim();
    if (password) seen.add(password);
  }
  return [...seen];
}
