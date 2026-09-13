import type { FetchedPage } from "./types";
import { abortError, isAbortError } from "./errors";
import { RateGate, sleep } from "./async";

/**
 * Same-origin passthrough for sources that send no CORS headers; see api/fetch.ts.
 */
export const PROXY_ENDPOINT = "/api/fetch";

const RETRY_BASE_DELAY_MS = 600;
const THROTTLE_BASE_DELAY_MS = 2_000;

/** Past this, reporting beats waiting: the reader can come back in a minute. */
const MAX_THROTTLE_DELAY_MS = 15_000;
const THROTTLE_RETRIES = 2;
const TOO_MANY_REQUESTS = 429;

export function isRateLimited(error: unknown): boolean {
  return error instanceof HttpError && error.status === TOO_MANY_REQUESTS;
}

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RequestOptions {
  retries?: number;
  signal?: AbortSignal;
  /** Shared for one run, so a 429 slows every chapter down, not just this one. */
  gate?: RateGate;
  onRetry?: (attempt: number, error: Error, waitMs: number) => void;
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
    const response = await fetchDirect(url, "application/json", options.signal);
    const body = await response.text();

    if (!response.ok) {
      throw httpError(response, describeJsonError(response, body));
    }
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
      await fetchDirect(url, "*/*", options.signal),
    );
    return response.text();
  }, options);
}

/**
 * A cross-origin call from the browser must send no referrer: Wattpad answers
 * any /api/v3 request carrying a foreign `Referer` with 400 PermissionDenied
 * ("go to developer.wattpad.com to get an API key"), which is what the browser
 * sends by default. A third-party host has no business knowing the page URL
 * either.
 */
function fetchDirect(
  url: string,
  accept: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    signal,
    headers: { accept },
    referrerPolicy: "no-referrer",
  });
}

async function expectOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  throw httpError(response, describeStatus(response));
}

function httpError(response: Response, message: string): HttpError {
  return new HttpError(response.status, message, retryAfterOf(response));
}

/** `Retry-After` is either a count of seconds or an absolute HTTP date. */
function retryAfterOf(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;

  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function describeStatus(response: Response): string {
  if (response.status === TOO_MANY_REQUESTS) {
    return "HTTP 429, máy chủ yêu cầu gọi chậm lại";
  }
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
  { retries = 2, signal, onRetry, gate }: RequestOptions,
): Promise<T> {
  let lastError: Error = new Error("Chưa thử tải lần nào.");
  let rounds = 0;
  let throttles = 0;

  for (;;) {
    if (signal?.aborted) throw abortError();
    await gate?.wait(signal);

    try {
      return await attempt();
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof HttpError && error.status === TOO_MANY_REQUESTS) {
        if (throttles >= THROTTLE_RETRIES) break;
        // Jitter keeps the paused workers from resuming in lockstep.
        const wait =
          Math.min(
            error.retryAfterMs ?? THROTTLE_BASE_DELAY_MS * 2 ** throttles,
            MAX_THROTTLE_DELAY_MS,
          ) +
          Math.random() * 500;
        throttles++;
        gate?.pause(wait);
        onRetry?.(throttles, lastError, wait);
        await sleep(wait);
      } else {
        if (rounds >= retries) break;
        const wait = RETRY_BASE_DELAY_MS * 2 ** rounds;
        rounds++;
        onRetry?.(rounds, lastError, wait);
        await sleep(wait);
      }
    }
  }

  throw lastError;
}
