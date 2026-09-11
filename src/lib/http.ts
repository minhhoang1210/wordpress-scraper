import type { FetchedPage } from "./types";
import { abortError, isAbortError } from "./errors";
import { sleep } from "./async";

/**
 * Same-origin passthrough for sources that send no CORS headers; see api/fetch.ts.
 */
export const PROXY_ENDPOINT = "/api/fetch";

const RETRY_BASE_DELAY_MS = 600;

export interface RequestOptions {
  retries?: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: Error) => void;
}

export function proxyUrl(target: string, cookie?: string): string {
  const base = `${PROXY_ENDPOINT}?url=${encodeURIComponent(target)}`;
  return cookie ? `${base}&cookie=${encodeURIComponent(cookie)}` : base;
}

export interface ProxiedPageOptions extends RequestOptions {
  /** Session cookie from an earlier unlock, relayed upstream by the proxy. */
  cookie?: string;
}

export async function fetchProxiedPage(
  target: string,
  { cookie, ...options }: ProxiedPageOptions = {},
): Promise<FetchedPage> {
  return withRetries(async () => {
    const response = await expectOk(
      await fetch(proxyUrl(target, cookie), {
        signal: options.signal,
        headers: { accept: "text/html,application/xhtml+xml" },
      }),
    );

    return {
      html: await response.text(),
      finalUrl: response.headers.get("x-final-url") || target,
    };
  }, options);
}

export async function fetchProxiedImage(
  target: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const response = await expectOk(await fetch(proxyUrl(target), { signal }));
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();

  return { data: new Uint8Array(await response.arrayBuffer()), mimeType };
}

export async function fetchJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  return withRetries(async () => {
    const response = await fetch(url, {
      signal: options.signal,
      headers: { accept: "application/json" },
    });
    const body = await response.text();

    if (!response.ok) throw new Error(describeJsonError(response, body));
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error("Máy chủ trả về dữ liệu không phải JSON.");
    }
  }, options);
}

export async function fetchPlainText(
  url: string,
  options: RequestOptions = {},
): Promise<string> {
  return withRetries(async () => {
    const response = await expectOk(
      await fetch(url, { signal: options.signal, headers: { accept: "*/*" } }),
    );
    return response.text();
  }, options);
}

async function expectOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  throw new Error(describeStatus(response));
}

function describeStatus(response: Response): string {
  return `HTTP ${response.status} ${response.statusText || ""}`.trim();
}

/** API errors carry a human-readable `message`; prefer it over the bare status. */
function describeJsonError(response: Response, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const detail = parsed.message ?? parsed.error;
    if (detail) return `${describeStatus(response)}: ${detail}`;
  } catch {
    // Not JSON; the status alone is all the detail there is.
  }
  return describeStatus(response);
}

async function withRetries<T>(
  attempt: () => Promise<T>,
  { retries = 2, signal, onRetry }: RequestOptions,
): Promise<T> {
  let lastError: Error = new Error("Chưa thử tải lần nào.");

  for (let round = 0; round <= retries; round++) {
    if (signal?.aborted) throw abortError();

    try {
      return await attempt();
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));

      if (round < retries) {
        onRetry?.(round + 1, lastError);
        await sleep(RETRY_BASE_DELAY_MS * 2 ** round);
      }
    }
  }

  throw lastError;
}
