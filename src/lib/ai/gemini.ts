import { sleep } from "../async";
import { abortError, isAbortError } from "../errors";
import type { JsonSchema } from "./schema";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
];

const BLOCKED_REASONS = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"];

const RETRY_BASE_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;

/** Gemini refused the passage; the caller should skip it, not retry it. */
export class GeminiBlockedError extends Error {}

export class GeminiRateLimitError extends Error {
  readonly retryMs: number;

  constructor(message: string, retryMs: number) {
    super(message);
    this.retryMs = retryMs;
  }
}

export interface GenerateOptions {
  apiKey: string;
  system: string;
  prompt: string;
  schema: JsonSchema;
  signal: AbortSignal;
  retries?: number;
  onRetry?: (waitMs: number, reason: string) => void;
}

export async function generateJson<T>(options: GenerateOptions): Promise<T> {
  const { retries = 3, signal, onRetry } = options;
  let lastError: Error = new Error("Chưa gọi Gemini lần nào.");

  for (let round = 0; round <= retries; round++) {
    if (signal.aborted) throw abortError();

    try {
      return await requestJson<T>(options);
    } catch (error) {
      if (isAbortError(error) || error instanceof GeminiBlockedError)
        throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (round === retries) break;

      const wait =
        lastError instanceof GeminiRateLimitError
          ? Math.min(lastError.retryMs, MAX_RETRY_DELAY_MS)
          : RETRY_BASE_DELAY_MS * 2 ** round;
      onRetry?.(wait, lastError.message);
      await sleep(wait);
    }
  }

  throw lastError;
}

async function requestJson<T>(options: GenerateOptions): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: options.system }] },
    contents: [{ role: "user", parts: [{ text: options.prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: options.schema,
    },
    safetySettings: SAFETY_CATEGORIES.map((category) => ({
      category,
      threshold: "BLOCK_NONE",
    })),
  };

  // The key travels in a header, never in the query string where it would end
  // up in browser history and referrer logs.
  const response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    signal: options.signal,
    referrerPolicy: "no-referrer",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) throw describeFailure(response.status, raw);

  return parseCandidate<T>(raw);
}

function parseCandidate<T>(raw: string): T {
  let payload: GeminiResponse;
  try {
    payload = JSON.parse(raw) as GeminiResponse;
  } catch {
    throw new Error("Gemini trả về dữ liệu không phải JSON.");
  }

  if (payload.promptFeedback?.blockReason) {
    throw new GeminiBlockedError(
      `Gemini từ chối đoạn này (${payload.promptFeedback.blockReason}).`,
    );
  }

  const candidate = payload.candidates?.[0];
  if (!candidate)
    throw new GeminiBlockedError("Gemini không trả lời đoạn này.");

  const reason = candidate.finishReason ?? "";
  if (BLOCKED_REASONS.includes(reason)) {
    throw new GeminiBlockedError(`Gemini từ chối đoạn này (${reason}).`);
  }
  if (reason === "MAX_TOKENS") {
    throw new Error("Câu trả lời bị cắt vì quá dài, thử chia nhỏ hơn.");
  }

  const text = (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini trả về câu trả lời rỗng.");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Không đọc được JSON trong câu trả lời của Gemini.");
  }
}

function describeFailure(status: number, raw: string): Error {
  const parsed = safeParse(raw);
  const detail = parsed?.error?.message ?? `HTTP ${status}`;

  if (status === 429) {
    return new GeminiRateLimitError(
      `Đã chạm hạn mức Gemini: ${detail}`,
      retryDelayOf(parsed) ?? RETRY_BASE_DELAY_MS * 4,
    );
  }
  if (status === 400 || status === 403) {
    return new Error(`Gemini từ chối yêu cầu: ${detail}`);
  }
  return new Error(`Gemini lỗi ${status}: ${detail}`);
}

/** Free-tier 429s carry the wait they want in a RetryInfo detail. */
function retryDelayOf(parsed: GeminiError | null): number | null {
  for (const detail of parsed?.error?.details ?? []) {
    const seconds = Number.parseFloat(detail.retryDelay ?? "");
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return null;
}

function safeParse(raw: string): GeminiError | null {
  try {
    return JSON.parse(raw) as GeminiError;
  } catch {
    return null;
  }
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

interface GeminiError {
  error?: {
    message?: string;
    details?: { retryDelay?: string }[];
  };
}
