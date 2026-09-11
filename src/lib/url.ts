/**
 * Resolves an href against a page URL, rejecting anything that cannot be
 * fetched: fragments, `javascript:`/`mailto:` and other non-web schemes.
 */
export function resolveUrl(
  href: string | null | undefined,
  baseUrl: string,
): string | null {
  const trimmed = href?.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Canonical identity of a link: host and path without a trailing slash. Query
 * strings and hashes are dropped so `?share=`, `?fbclid=…` and `#` variants of
 * one URL collapse into a single chapter.
 */
export function linkKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return url;
  }
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** decodeURIComponent throws on malformed escapes, which a stray href can contain. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
