import { computed, reactive, ref, shallowRef } from "vue";
import { fetchBinary, fetchPage } from "../lib/fetcher";
import {
  parseChapterPage,
  parseIndexPage,
  sortChapters,
  countWords,
} from "../lib/parser";
import { buildEpub } from "../lib/epub";
import { buildPdf, type PageSize } from "../lib/pdf";
import {
  FIXED,
  type Chapter,
  type LogEntry,
  type ScrapeOptions,
  type StoryMeta,
} from "../lib/types";

export type Phase =
  | "idle"
  | "indexing"
  | "ready"
  | "scraping"
  | "done"
  | "error";

export function useScraper() {
  const indexUrl = ref("");
  const phase = ref<Phase>("idle");
  const meta = shallowRef<StoryMeta | null>(null);
  const chapters = ref<Chapter[]>([]);
  const logs = ref<LogEntry[]>([]);
  const errorMessage = ref("");
  const busyMessage = ref("");
  const exporting = ref<"epub" | "pdf" | null>(null);

  const options = reactive<ScrapeOptions>({
    stripImages: false,
    concurrency: 4,
    delayMs: 250,
    retries: 2,
  });

  const pdfOptions = reactive<{ pageSize: PageSize; fontSize: number }>({
    pageSize: "a5",
    fontSize: 11,
  });

  let controller: AbortController | null = null;
  let logId = 0;

  function log(level: LogEntry["level"], message: string) {
    logs.value.push({ id: logId++, at: Date.now(), level, message });
    if (logs.value.length > 500) logs.value.splice(0, logs.value.length - 500);
  }

  const selected = computed(() =>
    chapters.value.filter((chapter) => chapter.selected),
  );
  const fetched = computed(() =>
    chapters.value.filter((chapter) => chapter.status === "done"),
  );
  const failed = computed(() =>
    chapters.value.filter((chapter) => chapter.status === "failed"),
  );
  const totalWords = computed(() =>
    fetched.value.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0),
  );
  const progress = computed(() => {
    const total = selected.value.length;
    if (total === 0) return 0;
    const settled = selected.value.filter(
      (chapter) => chapter.status === "done" || chapter.status === "failed",
    ).length;
    return Math.round((settled / total) * 100);
  });
  const canExport = computed(
    () => fetched.value.length > 0 && !exporting.value,
  );

  /** Bước 1 — đọc trang mục lục và liệt kê các liên kết chương. */
  async function loadIndex() {
    const target = indexUrl.value.trim();
    if (!target) return;

    controller?.abort();
    controller = new AbortController();
    phase.value = "indexing";
    errorMessage.value = "";
    busyMessage.value = "Đang tải trang mục lục…";
    meta.value = null;
    chapters.value = [];

    try {
      const { html, finalUrl } = await fetchPage(target, {
        retries: options.retries,
        signal: controller.signal,
        onRetry: (attempt, error) =>
          log("warn", `Thử lại trang mục lục lần ${attempt}: ${error.message}`),
      });
      log(
        "info",
        `Đã tải trang mục lục (${Math.round(html.length / 1024)} KB).`,
      );

      const parsed = parseIndexPage(html, finalUrl, options);
      meta.value = parsed.meta;
      chapters.value = FIXED.sortByNumber
        ? sortChapters(parsed.chapters)
        : parsed.chapters;

      if (parsed.chapters.length === 0) {
        log(
          "warn",
          "Không tìm thấy liên kết chương nào phù hợp trên trang này.",
        );
        phase.value = "ready";
        return;
      }

      log(
        "success",
        `Tìm thấy ${parsed.chapters.length} chương trong “${parsed.meta.title}”.`,
      );
      phase.value = "ready";
    } catch (error) {
      handleFailure(error, "Không tải được trang mục lục.");
    } finally {
      busyMessage.value = "";
    }
  }

  /** Bước 2 — tải từng chương đã chọn, giới hạn số yêu cầu song song. */
  async function scrapeChapters(only?: Chapter[]) {
    const queue = (only ?? selected.value).filter(
      (chapter) => chapter.status !== "done",
    );
    if (queue.length === 0) return;

    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    phase.value = "scraping";
    errorMessage.value = "";
    queue.forEach((chapter) => {
      chapter.status = "pending";
      chapter.error = undefined;
    });

    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, options.concurrency) },
      async () => {
        while (cursor < queue.length) {
          if (signal.aborted) return;
          const chapter = queue[cursor++];
          await scrapeOne(chapter, signal);
          if (options.delayMs > 0)
            await new Promise((r) => setTimeout(r, options.delayMs));
        }
      },
    );

    try {
      await Promise.all(workers);
      if (signal.aborted) {
        log("warn", "Đã huỷ quá trình tải.");
        phase.value = "ready";
        return;
      }
      phase.value = "done";
      log(
        failed.value.length > 0 ? "warn" : "success",
        `Tải hoàn tất — ${fetched.value.length} chương, ${failed.value.length} lỗi, ${totalWords.value.toLocaleString("vi-VN")} từ.`,
      );
    } catch (error) {
      handleFailure(error, "Quá trình tải bị dừng đột ngột.");
    }
  }

  async function scrapeOne(chapter: Chapter, signal: AbortSignal) {
    chapter.status = "fetching";
    try {
      const { html, finalUrl } = await fetchPage(chapter.url, {
        retries: options.retries,
        signal,
        onRetry: (attempt, error) =>
          log(
            "warn",
            `Thử lại lần ${attempt} — ${chapter.linkText}: ${error.message}`,
          ),
      });
      const parsed = parseChapterPage(html, finalUrl, options);
      chapter.title = parsed.title;
      chapter.html = parsed.html;
      chapter.wordCount = countWords(parsed.html);
      chapter.status = "done";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        chapter.status = "pending";
        return;
      }
      chapter.status = "failed";
      chapter.error = error instanceof Error ? error.message : String(error);
      log("error", `${chapter.linkText}: ${chapter.error}`);
    }
  }

  function retryFailed() {
    return scrapeChapters(failed.value);
  }

  function cancel() {
    controller?.abort();
    controller = null;
    busyMessage.value = "";
  }

  async function exportEpub() {
    if (!meta.value || fetched.value.length === 0) return;
    exporting.value = "epub";
    busyMessage.value = "Đang tạo EPUB…";

    try {
      const blob = await buildEpub(meta.value, fetched.value, {
        // Images are embedded whenever the user has not chosen to remove them.
        fetchImage: options.stripImages ? undefined : (url) => fetchBinary(url),
        onProgress: (message) => log("warn", message),
      });
      download(blob, `${slugify(meta.value.title)}.epub`);
      log("success", `EPUB đã sẵn sàng (${formatBytes(blob.size)}).`);
    } catch (error) {
      handleExportFailure(error, "EPUB");
    } finally {
      exporting.value = null;
      busyMessage.value = "";
    }
  }

  async function exportPdf() {
    if (!meta.value || fetched.value.length === 0) return;
    exporting.value = "pdf";
    busyMessage.value = "Đang nhúng phông chữ…";

    try {
      const blob = await buildPdf(meta.value, fetched.value, {
        pageSize: pdfOptions.pageSize,
        fontSize: pdfOptions.fontSize,
        // Images are embedded whenever the user has not chosen to remove them.
        fetchImage: options.stripImages ? undefined : (url) => fetchBinary(url),
        onStatus: (message) => {
          busyMessage.value = message;
        },
        onWarning: (message) => log("warn", message),
      });
      download(blob, `${slugify(meta.value.title)}.pdf`);
      log("success", `PDF đã sẵn sàng (${formatBytes(blob.size)}).`);
    } catch (error) {
      handleExportFailure(error, "PDF");
    } finally {
      exporting.value = null;
      busyMessage.value = "";
    }
  }

  function handleFailure(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") {
      phase.value = "idle";
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = `${fallback} ${message}`;
    log("error", errorMessage.value);
    phase.value = "error";
  }

  function handleExportFailure(error: unknown, format: string) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = `Tạo ${format} thất bại: ${message}`;
    log("error", errorMessage.value);
  }

  function selectAll(value: boolean) {
    chapters.value.forEach((chapter) => (chapter.selected = value));
  }

  return {
    indexUrl,
    phase,
    meta,
    chapters,
    logs,
    errorMessage,
    busyMessage,
    exporting,
    options,
    pdfOptions,
    selected,
    fetched,
    failed,
    totalWords,
    progress,
    canExport,
    loadIndex,
    scrapeChapters,
    retryFailed,
    cancel,
    exportEpub,
    exportPdf,
    selectAll,
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "truyen"
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
