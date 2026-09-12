import { sleep } from "../async";
import { abortError, errorMessage, isAbortError } from "../errors";
import type { Chapter, StoryMeta } from "../types";
import { batchChapters, chapterTexts } from "./chunk";
import { GeminiBlockedError, generateJson } from "./gemini";
import { mergeDigests } from "./merge";
import {
  COMPRESS_SYSTEM,
  MAP_SYSTEM,
  REDUCE_SYSTEM,
  compressPrompt,
  mapPrompt,
  reducePrompt,
} from "./prompts";
import {
  BATCH_SCHEMA,
  EVENTS_SCHEMA,
  STORY_SCHEMA,
  type BatchDigest,
  type JsonSchema,
  type StoryDigest,
} from "./schema";

/** The free tier caps requests per minute, so batches go one at a time. */
const REQUEST_GAP_MS = 4_000;

const MAX_EVENT_CHARS = 40_000;
const MIN_EVENTS = 8;

export { GEMINI_MODEL } from "./gemini";
export { BATCH_CHARS, chapterTexts } from "./chunk";
export type {
  ArcNote,
  CharacterNote,
  RelationshipNote,
  StoryDigest,
} from "./schema";

export interface AnalyzeOptions {
  apiKey: string;
  meta: StoryMeta;
  chapters: Chapter[];
  signal: AbortSignal;
  onStatus: (message: string) => void;
  onProgress: (done: number, total: number) => void;
  warn: (message: string) => void;
}

export async function analyzeStory(
  options: AnalyzeOptions,
): Promise<StoryDigest> {
  const texts = chapterTexts(options.chapters);
  if (texts.length === 0) {
    throw new Error("Chưa có chương nào có nội dung để đọc.");
  }

  const batches = batchChapters(texts);
  const steps = batches.length + 1;
  const digests: BatchDigest[] = [];

  for (const [index, batch] of batches.entries()) {
    if (options.signal.aborted) throw abortError();
    options.onStatus(`Đang đọc phần ${index + 1}/${batches.length}…`);

    try {
      digests.push(
        await call<BatchDigest>(options, {
          system: MAP_SYSTEM,
          prompt: mapPrompt(options.meta, batch),
          schema: BATCH_SCHEMA,
        }),
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      const range = `chương ${batch[0].position} tới ${batch[batch.length - 1].position}`;
      options.warn(
        error instanceof GeminiBlockedError
          ? `Bỏ qua ${range}: ${errorMessage(error)}`
          : `Không đọc được ${range}: ${errorMessage(error)}`,
      );
    }

    options.onProgress(index + 1, steps);
    if (index < batches.length - 1) await sleep(REQUEST_GAP_MS);
  }

  if (digests.length === 0) {
    throw new Error("Gemini không đọc được phần nào của truyện.");
  }
  if (digests.length < batches.length) {
    options.warn(
      `Tóm tắt dựng từ ${digests.length}/${batches.length} phần, có chỗ bị thiếu.`,
    );
  }

  const merged = mergeDigests(digests);
  merged.events = await compressEvents(merged.events, options);

  options.onStatus("Đang tổng hợp toàn truyện…");
  const digest = await call<StoryDigest>(options, {
    system: REDUCE_SYSTEM,
    prompt: reducePrompt(options.meta, merged),
    schema: STORY_SCHEMA,
  });

  options.onProgress(steps, steps);
  return digest;
}

/**
 * A long novel produces more notes than one reduce call should carry, so the
 * event list is folded down before the final pass.
 */
async function compressEvents(
  events: string[],
  options: AnalyzeOptions,
): Promise<string[]> {
  let current = events;

  while (charsOf(current) > MAX_EVENT_CHARS && current.length > MIN_EVENTS) {
    if (options.signal.aborted) throw abortError();
    options.onStatus("Đang rút gọn ghi chú…");

    const target = Math.max(MIN_EVENTS, Math.round(current.length / 2));
    const result = await call<{ events: string[] }>(options, {
      system: COMPRESS_SYSTEM,
      prompt: compressPrompt(current, target),
      schema: EVENTS_SCHEMA,
    });

    if (result.events.length >= current.length) break;
    current = result.events;
    await sleep(REQUEST_GAP_MS);
  }

  return current;
}

function call<T>(
  options: AnalyzeOptions,
  request: { system: string; prompt: string; schema: JsonSchema },
): Promise<T> {
  return generateJson<T>({
    ...request,
    apiKey: options.apiKey,
    signal: options.signal,
    onRetry: (waitMs, reason) =>
      options.warn(
        `Gemini: ${reason} Thử lại sau ${Math.round(waitMs / 1000)} giây.`,
      ),
  });
}

const charsOf = (events: string[]) =>
  events.reduce((total, event) => total + event.length, 0);
