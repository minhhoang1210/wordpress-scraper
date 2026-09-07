import type { FetchedDocument } from "./types";

/**
 * WordPress pages carry no CORS headers, so every request goes through the
 * same-origin passthrough in server/proxy.ts. The proxy also submits the
 * password form for protected posts and returns the session cookie, which the
 * browser cannot set itself; that cookie is relayed as a query parameter.
 */
function buildRequestUrl(target: string, cookie?: string): string {
  const base = `/api/fetch?url=${encodeURIComponent(target)}`;
  return cookie ? `${base}&cookie=${encodeURIComponent(cookie)}` : base;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FetchOptions {
  retries?: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: Error) => void;
  /** Session cookie from a previous password unlock, forwarded upstream. */
  cookie?: string;
}

export async function fetchPage(
  target: string,
  { retries = 2, signal, onRetry, cookie }: FetchOptions = {},
): Promise<FetchedDocument> {
  let lastError: Error = new Error("Chưa thực hiện lần tải nào.");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const response = await fetch(buildRequestUrl(target, cookie), {
        signal,
        headers: { accept: "text/html,application/xhtml+xml" },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText || ""}`.trim(),
        );
      }

      return {
        html: await response.text(),
        // Post-redirect URL, so relative links resolve against the real page.
        finalUrl: response.headers.get("x-final-url") || target,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        onRetry?.(attempt + 1, lastError);
        await sleep(600 * 2 ** attempt);
      }
    }
  }

  throw lastError;
}

export async function fetchBinary(
  target: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const response = await fetch(buildRequestUrl(target), { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${target}`);

  const buffer = await response.arrayBuffer();
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();
  return { data: new Uint8Array(buffer), mimeType };
}

/** Submits the WordPress post-password form and returns the session cookie. */
export async function unlockPostPassword(
  loginUrl: string,
  password: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<string | null> {
  const response = await fetch(
    `/api/fetch?url=${encodeURIComponent(loginUrl)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { post_password: password } }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — không mở khoá được`);
  }
  const setCookie = response.headers.get("x-set-cookie");
  return setCookie ? cookiePairs(setCookie) : null;
}

/** Reduces a Set-Cookie header to `name=value` pairs, dropping attributes. */
function cookiePairs(value: string): string | null {
  const segments = value.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_.-]*=)/);
  const seen = new Set<string>();
  const pairs: string[] = [];

  for (const segment of segments) {
    const pair = segment.split(";")[0].trim();
    const match = /^([^=]+)=([\s\S]*)$/.exec(pair);
    if (!match) continue;
    const name = match[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    pairs.push(`${name}=${match[2].trim()}`);
  }

  return pairs.length > 0 ? pairs.join("; ") : null;
}
