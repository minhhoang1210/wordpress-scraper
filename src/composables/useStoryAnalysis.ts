import { computed, ref, shallowRef } from "vue";
import { analyzeStory, type StoryDigest } from "../lib/ai";
import { errorMessage, isAbortError } from "../lib/errors";
import type { Chapter, StoryMeta } from "../lib/types";
import type { ActivityLog } from "./useActivityLog";
import { useGeminiKey } from "./useGeminiKey";

export type AnalysisPhase = "idle" | "running" | "done" | "error";

export type StoryAnalysis = ReturnType<typeof useStoryAnalysis>;

const CACHE_PREFIX = "ws-analysis:";

interface CachedDigest {
  chapterCount: number;
  at: number;
  digest: StoryDigest;
}

export function useStoryAnalysis(log: ActivityLog) {
  const { apiKey } = useGeminiKey();

  const phase = ref<AnalysisPhase>("idle");
  const digest = shallowRef<StoryDigest | null>(null);
  const errorText = ref("");
  const statusMessage = ref("");
  const progress = ref(0);
  /** Chapters to read, counted from the first; 0 means every downloaded one. */
  const scope = ref(0);
  const savedAt = ref<number | null>(null);
  const savedChapterCount = ref(0);

  let controller: AbortController | null = null;
  let cacheKey = "";

  const running = computed(() => phase.value === "running");
  const ready = computed(() => apiKey.value.trim().length > 0);

  function reset(): void {
    controller?.abort();
    controller = null;
    phase.value = "idle";
    digest.value = null;
    errorText.value = "";
    statusMessage.value = "";
    progress.value = 0;
    scope.value = 0;
    savedAt.value = null;
    savedChapterCount.value = 0;
    cacheKey = "";
  }

  /** A digest costs real quota, so an earlier one for this story comes back. */
  function restore(meta: StoryMeta): void {
    cacheKey = CACHE_PREFIX + meta.sourceUrl;
    const cached = readCache(cacheKey);
    if (!cached) return;

    digest.value = cached.digest;
    savedAt.value = cached.at;
    savedChapterCount.value = cached.chapterCount;
    phase.value = "done";
  }

  async function run(meta: StoryMeta, chapters: Chapter[]): Promise<void> {
    const key = apiKey.value.trim();
    if (!key || chapters.length === 0 || running.value) return;

    const included = chapters.slice(0, scope.value || chapters.length);
    controller?.abort();
    controller = new AbortController();

    phase.value = "running";
    errorText.value = "";
    progress.value = 0;
    statusMessage.value = "Đang chuẩn bị…";
    log.info(`Đang đọc ${included.length} chương bằng Gemini.`);

    try {
      const result = await analyzeStory({
        apiKey: key,
        meta,
        chapters: included,
        signal: controller.signal,
        onStatus: (message) => {
          statusMessage.value = message;
        },
        onProgress: (done, total) => {
          progress.value = Math.round((done / total) * 100);
        },
        warn: log.warn,
      });

      digest.value = result;
      savedAt.value = Date.now();
      savedChapterCount.value = included.length;
      phase.value = "done";
      writeCache(cacheKey, {
        chapterCount: included.length,
        at: savedAt.value,
        digest: result,
      });
      log.success(
        `Xong tóm tắt, tìm được ${result.characters.length} nhân vật.`,
      );
    } catch (error) {
      if (isAbortError(error)) {
        phase.value = digest.value ? "done" : "idle";
        log.warn("Đã huỷ đọc tóm tắt.");
        return;
      }
      errorText.value = errorMessage(error);
      phase.value = "error";
      log.error(`Không tóm tắt được: ${errorText.value}`);
    } finally {
      statusMessage.value = "";
      controller = null;
    }
  }

  function cancel(): void {
    controller?.abort();
    controller = null;
  }

  return {
    phase,
    digest,
    errorText,
    statusMessage,
    progress,
    scope,
    savedAt,
    savedChapterCount,
    running,
    ready,
    apiKey,
    run,
    cancel,
    reset,
    restore,
  };
}

function readCache(key: string): CachedDigest | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedDigest) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: CachedDigest): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Over quota or unavailable; the digest still lives in memory this visit.
  }
}
