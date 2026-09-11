import { computed, reactive, ref, shallowRef, watch } from "vue";
import {
  fetchBinary,
  fetchPage,
  unlockPostPassword,
  type FetchOptions,
} from "../lib/fetcher";
import {
  countWords,
  parseChapterPage,
  parseIndexPage,
  passwordFormAction,
} from "../lib/parser";
import { buildEpub } from "../lib/epub";
import { buildPdf, type PageSize } from "../lib/pdf";
import { runPool } from "../lib/async";
import { downloadBlob } from "../lib/download";
import {
  errorMessage,
  formatBytes,
  isAbortError,
  slugify,
  splitPasswords,
} from "../lib/text";
import type { Chapter, LogEntry, ScrapeOptions, StoryMeta } from "../lib/types";

export type Phase =
  "idle" | "indexing" | "ready" | "scraping" | "done" | "error";

export type ExportFormat = "epub" | "pdf";

type ParsedChapter = ReturnType<typeof parseChapterPage>;

const MAX_LOG_ENTRIES = 500;

export function useScraper() {
  const indexUrl = ref("");
  const phase = ref<Phase>("idle");
  const meta = shallowRef<StoryMeta | null>(null);
  const chapters = ref<Chapter[]>([]);
  const logs = ref<LogEntry[]>([]);
  const errorText = ref("");
  const busyMessage = ref("");
  const exporting = ref<ExportFormat | null>(null);

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

  const chapterPassword = ref("");
  const passwords = computed(() => splitPasswords(chapterPassword.value));
  const unlockCache = new Map<string, Promise<string | null>>();
  const unlockWarned = new Set<string>();
  let preferredCookie: string | null = null;

  watch(chapterPassword, resetUnlock);

  function resetUnlock() {
    unlockCache.clear();
    unlockWarned.clear();
    preferredCookie = null;
  }

  function log(level: LogEntry["level"], message: string) {
    logs.value.push({ id: logId++, at: Date.now(), level, message });
    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value.splice(0, logs.value.length - MAX_LOG_ENTRIES);
    }
  }

  const byStatus = (status: Chapter["status"]) =>
    computed(() => chapters.value.filter((c) => c.status === status));

  const selected = computed(() => chapters.value.filter((c) => c.selected));
  const fetched = byStatus("done");
  const failed = byStatus("failed");

  const totalWords = computed(() =>
    fetched.value.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0),
  );

  const progress = computed(() => {
    const total = selected.value.length;
    if (total === 0) return 0;
    const settled = selected.value.filter(
      (c) => c.status === "done" || c.status === "failed",
    ).length;
    return Math.round((settled / total) * 100);
  });

  const busy = computed(
    () => phase.value === "indexing" || phase.value === "scraping",
  );
  const canExport = computed(
    () => fetched.value.length > 0 && !exporting.value,
  );

  function restartController(): AbortSignal {
    controller?.abort();
    controller = new AbortController();
    return controller.signal;
  }

  async function loadIndex() {
    const target = indexUrl.value.trim();
    if (!target) return;

    const signal = restartController();
    resetUnlock();
    phase.value = "indexing";
    errorText.value = "";
    busyMessage.value = "Đang tải trang mục lục…";
    meta.value = null;
    chapters.value = [];

    try {
      const { html, finalUrl } = await fetchPage(target, {
        retries: options.retries,
        signal,
        onRetry: (attempt, error) =>
          log("warn", `Thử lại trang mục lục lần ${attempt}: ${error.message}`),
      });
      log(
        "info",
        `Đã tải trang mục lục (${Math.round(html.length / 1024)} KB).`,
      );

      const parsed = parseIndexPage(html, finalUrl, options);
      meta.value = parsed.meta;
      chapters.value = parsed.chapters;
      phase.value = "ready";

      if (parsed.chapters.length === 0) {
        log(
          "warn",
          "Không tìm thấy liên kết chương nào phù hợp trên trang này.",
        );
        return;
      }
      log(
        "success",
        `Tìm thấy ${parsed.chapters.length} chương trong “${parsed.meta.title}”.`,
      );
    } catch (error) {
      fail(error, "Không tải được trang mục lục.");
    } finally {
      busyMessage.value = "";
    }
  }

  async function scrapeChapters(only?: Chapter[]) {
    const queue = (only ?? selected.value).filter((c) => c.status !== "done");
    if (queue.length === 0) return;

    const signal = restartController();
    phase.value = "scraping";
    errorText.value = "";
    queue.forEach((chapter) => {
      chapter.status = "pending";
      chapter.error = undefined;
    });

    try {
      await runPool(queue, (chapter) => scrapeOne(chapter, signal), {
        concurrency: options.concurrency,
        delayMs: options.delayMs,
        signal,
      });

      if (signal.aborted) {
        log("warn", "Đã huỷ quá trình tải.");
        phase.value = "ready";
        return;
      }

      phase.value = "done";
      log(
        failed.value.length > 0 ? "warn" : "success",
        `Tải hoàn tất — ${fetched.value.length} chương, ${failed.value.length} lỗi, ` +
          `${totalWords.value.toLocaleString("vi-VN")} từ.`,
      );
    } catch (error) {
      fail(error, "Quá trình tải bị dừng đột ngột.");
    }
  }

  function requestCookie(
    loginUrl: string,
    password: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const key = `${loginUrl}\n${password}`;
    const cached = unlockCache.get(key);
    if (cached) return cached;

    const pending = unlockPostPassword(loginUrl, password, { signal }).catch(
      (error: unknown) => {
        unlockCache.delete(key);
        if (isAbortError(error)) throw error;
        if (!unlockWarned.has(key)) {
          unlockWarned.add(key);
          log("warn", `Không gửi được mật khẩu: ${errorMessage(error)}`);
        }
        return null;
      },
    );
    unlockCache.set(key, pending);
    return pending;
  }

  /**
   * Tries each password until one reveals the chapter. WordPress hands out a
   * cookie for wrong passwords too, so only a refetch proves an unlock.
   */
  async function unlockChapter(
    chapter: Chapter,
    loginUrl: string,
    usedCookie: string | null,
    fetchOptions: FetchOptions,
    signal: AbortSignal,
  ): Promise<ParsedChapter | null> {
    for (const [index, password] of passwords.value.entries()) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const cookie = await requestCookie(loginUrl, password, signal);
      if (!cookie || cookie === usedCookie) continue;

      const page = await fetchPage(chapter.url, { ...fetchOptions, cookie });
      const parsed = parseChapterPage(page.html, page.finalUrl, options);
      if (parsed.protected) continue;

      if (preferredCookie !== cookie) {
        preferredCookie = cookie;
        log(
          "success",
          `Mở khoá bằng mật khẩu #${index + 1} — ${chapter.linkText}.`,
        );
      }
      return parsed;
    }
    return null;
  }

  async function scrapeOne(chapter: Chapter, signal: AbortSignal) {
    chapter.status = "fetching";
    try {
      const onRetry = (attempt: number, error: Error) =>
        log(
          "warn",
          `Thử lại lần ${attempt} — ${chapter.linkText}: ${error.message}`,
        );
      const cookie = preferredCookie;
      const fetchOptions: FetchOptions = {
        retries: options.retries,
        signal,
        onRetry,
        cookie: cookie ?? undefined,
      };

      const first = await fetchPage(chapter.url, fetchOptions);
      let parsed = parseChapterPage(first.html, first.finalUrl, options);

      if (parsed.protected && passwords.value.length > 0) {
        const loginUrl = passwordFormAction(first.html, first.finalUrl);
        const unlocked = loginUrl
          ? await unlockChapter(chapter, loginUrl, cookie, fetchOptions, signal)
          : null;
        if (unlocked) parsed = unlocked;
      }

      chapter.title = parsed.title;
      chapter.protected = parsed.protected;
      chapter.html = parsed.html;
      chapter.wordCount = countWords(parsed.html);
      if (parsed.protected) {
        const tried = passwords.value.length;
        log(
          "warn",
          tried > 0
            ? `${chapter.linkText}: không mở khoá được với ${tried} mật khẩu đã nhập — sẽ chèn liên kết tới trang gốc.`
            : `${chapter.linkText}: chương yêu cầu mật khẩu — sẽ chèn liên kết tới trang gốc thay cho nội dung.`,
        );
      }
      chapter.status = "done";
    } catch (error) {
      // A cancelled chapter returns to the queue instead of counting as a failure.
      if (isAbortError(error)) {
        chapter.status = "pending";
        return;
      }
      chapter.status = "failed";
      chapter.error = errorMessage(error);
      log("error", `${chapter.linkText}: ${chapter.error}`);
    }
  }

  const retryFailed = () => scrapeChapters(failed.value);

  function cancel() {
    controller?.abort();
    controller = null;
    busyMessage.value = "";
  }

  async function runExport(
    format: ExportFormat,
    build: (meta: StoryMeta, chapters: Chapter[]) => Promise<Blob>,
  ) {
    if (!meta.value || fetched.value.length === 0) return;

    exporting.value = format;
    errorText.value = "";
    busyMessage.value = `Đang chuẩn bị ${format.toUpperCase()}…`;

    try {
      const blob = await build(meta.value, fetched.value);
      downloadBlob(blob, `${slugify(meta.value.title)}.${format}`);
      log(
        "success",
        `${format.toUpperCase()} đã sẵn sàng (${formatBytes(blob.size)}).`,
      );
    } catch (error) {
      errorText.value = `Tạo ${format.toUpperCase()} thất bại: ${errorMessage(error)}`;
      log("error", errorText.value);
    } finally {
      exporting.value = null;
      busyMessage.value = "";
    }
  }

  const exportHooks = () => ({
    fetchImage: options.stripImages
      ? undefined
      : (url: string) => fetchBinary(url),
    onStatus: (message: string) => {
      busyMessage.value = message;
    },
    onWarning: (message: string) => log("warn", message),
  });

  const exportEpub = () =>
    runExport("epub", (meta, chapters) =>
      buildEpub(meta, chapters, exportHooks()),
    );

  const exportPdf = () =>
    runExport("pdf", (meta, chapters) =>
      buildPdf(meta, chapters, {
        ...exportHooks(),
        pageSize: pdfOptions.pageSize,
        fontSize: pdfOptions.fontSize,
      }),
    );

  function fail(error: unknown, fallback: string) {
    if (isAbortError(error)) {
      phase.value = "idle";
      return;
    }
    errorText.value = `${fallback} ${errorMessage(error)}`;
    log("error", errorText.value);
    phase.value = "error";
  }

  function selectAll(value: boolean) {
    chapters.value.forEach((chapter) => (chapter.selected = value));
  }

  /** Moves a chapter to a new index; exporters follow this display order. */
  function reorderChapter(chapter: Chapter, toIndex: number) {
    const list = chapters.value;
    const fromIndex = list.indexOf(chapter);
    if (fromIndex === -1) return;
    const clamped = Math.max(0, Math.min(list.length - 1, toIndex));
    if (clamped === fromIndex) return;
    list.splice(fromIndex, 1);
    list.splice(clamped, 0, chapter);
  }

  return {
    indexUrl,
    phase,
    meta,
    chapters,
    logs,
    errorText,
    busyMessage,
    exporting,
    options,
    pdfOptions,
    chapterPassword,
    selected,
    fetched,
    failed,
    totalWords,
    progress,
    busy,
    canExport,
    loadIndex,
    scrapeChapters,
    retryFailed,
    cancel,
    exportEpub,
    exportPdf,
    selectAll,
    reorderChapter,
  };
}
