import { computed, reactive, ref } from "vue";
import { RateGate, runPool } from "../lib/async";
import { downloadBlob } from "../lib/download";
import { errorMessage, isAbortError } from "../lib/errors";
import { isRateLimited } from "../lib/http";
import {
  exportStory,
  type ExportFormat,
  type PdfSettings,
} from "../lib/export";
import { countWords } from "../lib/html";
import type { StorySource } from "../lib/sources";
import type { DownloadContext, StorySession } from "../lib/sources/types";
import { formatBytes } from "../lib/text";
import type { Chapter, ScrapeSettings, StoryMeta } from "../lib/types";
import { useActivityLog } from "./useActivityLog";

export type Phase =
  "idle" | "loading" | "ready" | "downloading" | "done" | "error";

export type StoryScraper = ReturnType<typeof useStoryScraper>;

export function useStoryScraper(source: StorySource) {
  const log = useActivityLog();

  const storyUrl = ref("");
  const credential = ref("");
  const phase = ref<Phase>("idle");
  const meta = ref<StoryMeta | null>(null);
  const chapters = ref<Chapter[]>([]);
  const errorText = ref("");
  const rateLimited = ref(false);
  const statusMessage = ref("");
  const exporting = ref<ExportFormat | null>(null);

  const settings = reactive<ScrapeSettings>({ stripImages: false });
  const pdfSettings = reactive<PdfSettings>({ pageSize: "a5", fontSize: 11 });

  let originalMeta: StoryMeta | null = null;
  let session: StorySession | null = null;
  let controller: AbortController | null = null;

  const selected = computed(() =>
    chapters.value.filter((chapter) => chapter.selected),
  );
  const downloaded = computed(() =>
    chapters.value.filter((chapter) => chapter.status === "done"),
  );
  const failed = computed(() =>
    chapters.value.filter((chapter) => chapter.status === "failed"),
  );

  const totalWords = computed(() =>
    downloaded.value.reduce(
      (sum, chapter) => sum + (chapter.wordCount ?? 0),
      0,
    ),
  );

  const progress = computed(() => {
    const total = selected.value.length;
    if (total === 0) return 0;
    const settled = selected.value.filter(
      (chapter) => chapter.status === "done" || chapter.status === "failed",
    ).length;
    return Math.round((settled / total) * 100);
  });

  const busy = computed(
    () => phase.value === "loading" || phase.value === "downloading",
  );
  const canExport = computed(
    () => downloaded.value.length > 0 && !exporting.value,
  );

  async function loadStory(): Promise<void> {
    const url = storyUrl.value.trim();
    if (!url) return;

    const signal = restartController();
    session = source.createSession();
    phase.value = "loading";
    errorText.value = "";
    statusMessage.value = "Đang tải thông tin truyện…";
    meta.value = null;
    chapters.value = [];

    try {
      const index = await session.loadIndex(url, contextFor(signal));
      meta.value = index.meta;
      originalMeta = { ...index.meta };
      chapters.value = index.chapters;
      phase.value = "ready";

      if (index.chapters.length === 0) {
        log.warn("Không thấy chương nào ở liên kết này.");
        return;
      }
      log.success(
        `Tìm thấy ${index.chapters.length} chương trong “${index.meta.title}”.`,
      );
    } catch (error) {
      fail(error, "Không tải được truyện.");
    } finally {
      statusMessage.value = "";
    }
  }

  async function downloadChapters(only?: Chapter[]): Promise<void> {
    const activeSession = session;
    const queue = (only ?? selected.value).filter(
      (chapter) => chapter.status !== "done",
    );
    if (!activeSession || queue.length === 0) return;

    const signal = restartController();
    phase.value = "downloading";
    errorText.value = "";
    rateLimited.value = false;
    for (const chapter of queue) {
      chapter.status = "pending";
      chapter.error = undefined;
    }

    const context = contextFor(signal);
    const { concurrency, delayMs } = source.fetchPolicy;

    try {
      await runPool(
        queue,
        (chapter) => downloadChapter(activeSession, chapter, context),
        { concurrency, delayMs, signal },
      );

      if (signal.aborted) {
        log.warn("Đã huỷ tải.");
        phase.value = "ready";
        return;
      }

      phase.value = "done";
      reportBatchResult();
    } catch (error) {
      fail(error, "Tải bị dừng giữa chừng.");
    }
  }

  async function downloadChapter(
    activeSession: StorySession,
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<void> {
    chapter.status = "fetching";

    try {
      const content = await activeSession.loadChapter(chapter, context);
      chapter.title = content.title || undefined;
      chapter.locked = content.locked;
      chapter.html = content.html;
      chapter.wordCount = countWords(content.html);
      chapter.status = "done";
    } catch (error) {
      // A cancelled chapter returns to the queue instead of counting as a failure.
      if (isAbortError(error)) {
        chapter.status = "pending";
        return;
      }
      chapter.status = "failed";
      chapter.error = errorMessage(error);
      if (isRateLimited(error)) rateLimited.value = true;
      log.error(`${chapter.label}: ${chapter.error}`);
    }
  }

  function reportBatchResult(): void {
    const done =
      `Tải xong ${downloaded.value.length} chương, ` +
      `tổng ${totalWords.value.toLocaleString("vi-VN")} từ`;

    if (failed.value.length === 0) {
      log.success(`${done}.`);
      return;
    }

    log.warn(`${done}, còn ${failed.value.length} chương lỗi.`);
    if (rateLimited.value) {
      log.warn(
        `${source.name} đang giới hạn tốc độ. Chờ 1 tới 2 phút rồi bấm Thử lại.`,
      );
    }
  }

  const retryFailed = () => downloadChapters(failed.value);

  function cancel(): void {
    controller?.abort();
    controller = null;
    statusMessage.value = "";
  }

  async function runExport(format: ExportFormat): Promise<void> {
    if (!meta.value || downloaded.value.length === 0) return;

    exporting.value = format;
    errorText.value = "";
    statusMessage.value = `Đang chuẩn bị ${format.toUpperCase()}…`;

    try {
      const file = await exportStory(format, {
        meta: meta.value,
        chapters: downloaded.value,
        settings,
        pdf: pdfSettings,
        onStatus: (message) => {
          statusMessage.value = message;
        },
        onWarning: log.warn,
      });
      downloadBlob(file.blob, file.filename);
      log.success(
        `${format.toUpperCase()} đã sẵn sàng (${formatBytes(file.blob.size)}).`,
      );
    } catch (error) {
      errorText.value = `Tạo ${format.toUpperCase()} thất bại: ${errorMessage(error)}`;
      log.error(errorText.value);
    } finally {
      exporting.value = null;
      statusMessage.value = "";
    }
  }

  /** Undoes hand edits by putting the scraped metadata back. */
  function restoreMeta(): void {
    if (originalMeta) meta.value = { ...originalMeta };
  }

  function selectAll(value: boolean): void {
    for (const chapter of chapters.value) chapter.selected = value;
  }

  /** Puts a chapter directly before `target`; a null target moves it last. */
  function moveChapterBefore(chapter: Chapter, target: Chapter | null): void {
    const list = chapters.value;
    const from = list.indexOf(chapter);
    const before = target ? list.indexOf(target) : list.length;
    if (from === -1 || before === -1) return;

    // Removing the chapter first shifts every later position down by one.
    const to = before > from ? before - 1 : before;
    if (to === from) return;

    list.splice(from, 1);
    list.splice(to, 0, chapter);
  }

  function contextFor(signal: AbortSignal): DownloadContext {
    return {
      signal,
      gate: new RateGate(),
      retries: source.fetchPolicy.retries,
      stripImages: settings.stripImages,
      credential: credential.value,
      warn: log.warn,
      notice: log.success,
    };
  }

  function restartController(): AbortSignal {
    controller?.abort();
    controller = new AbortController();
    return controller.signal;
  }

  function fail(error: unknown, fallback: string): void {
    if (isAbortError(error)) {
      phase.value = "idle";
      return;
    }
    errorText.value = `${fallback} ${errorMessage(error)}`;
    log.error(errorText.value);
    phase.value = "error";
  }

  return {
    source,
    logs: log.entries,
    storyUrl,
    credential,
    phase,
    meta,
    chapters,
    errorText,
    rateLimited,
    statusMessage,
    exporting,
    settings,
    pdfSettings,
    selected,
    downloaded,
    failed,
    totalWords,
    progress,
    busy,
    canExport,
    loadStory,
    downloadChapters,
    retryFailed,
    cancel,
    exportEpub: () => runExport("epub"),
    exportPdf: () => runExport("pdf"),
    selectAll,
    restoreMeta,
    moveChapterBefore,
  };
}
