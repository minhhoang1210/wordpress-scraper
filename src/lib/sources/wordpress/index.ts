import { abortError } from "../../errors";
import { parseHtml, sanitize } from "../../html";
import { fetchProxiedPage } from "../../http";
import type { Chapter, FetchedPage } from "../../types";
import { requestOptions } from "../request";
import type {
  ChapterContent,
  DownloadContext,
  StoryIndex,
  StorySession,
  StorySource,
} from "../types";
import {
  findChapterLinks,
  removeChapterLists,
  sortChapters,
} from "./chapterLinks";
import {
  findArticle,
  findPasswordFormAction,
  isPasswordProtected,
  readAuthor,
  readChapterTitle,
  readLanguage,
  readTitle,
  THEME_JUNK,
} from "./page";
import { PasswordSession } from "./password";

class WordpressSession implements StorySession {
  private passwordSession: PasswordSession | null = null;
  private credential = "";

  async loadIndex(url: string, context: DownloadContext): Promise<StoryIndex> {
    const page = await fetchProxiedPage(
      url,
      requestOptions(context, "trang mục lục"),
    );
    const doc = parseHtml(page.html);
    const article = findArticle(doc);
    const chapters = sortChapters(findChapterLinks(article, page.finalUrl));

    return {
      meta: {
        title: readTitle(doc),
        author: readAuthor(doc),
        language: readLanguage(doc),
        descriptionHtml: this.readSynopsis(article, page, chapters, context),
        sourceUrl: page.finalUrl,
      },
      chapters,
    };
  }

  async loadChapter(
    chapter: Chapter,
    context: DownloadContext,
  ): Promise<ChapterContent> {
    const passwords = this.passwordsFor(context);
    const cookie = passwords.cookie ?? undefined;
    const page = await this.fetchChapterPage(chapter, cookie, context);
    const content = this.readChapter(page, context);
    if (!content.locked) return content;

    const unlocked = await this.unlock(chapter, page, cookie, context);
    if (unlocked) return unlocked;

    context.warn(describeLockedChapter(chapter, passwords.passwords.length));
    return content;
  }

  /**
   * Tries each password until one reveals the chapter. WordPress hands out a
   * cookie for wrong passwords too, so only a refetch proves an unlock.
   */
  private async unlock(
    chapter: Chapter,
    lockedPage: FetchedPage,
    usedCookie: string | undefined,
    context: DownloadContext,
  ): Promise<ChapterContent | null> {
    const passwords = this.passwordsFor(context);
    if (passwords.passwords.length === 0) return null;

    const loginUrl = findPasswordFormAction(
      lockedPage.html,
      lockedPage.finalUrl,
    );
    if (!loginUrl) return null;

    for (const [index, password] of passwords.passwords.entries()) {
      if (context.signal.aborted) throw abortError();

      const cookie = await passwords.cookieFor(loginUrl, password, context);
      if (!cookie || cookie === usedCookie) continue;

      const page = await this.fetchChapterPage(chapter, cookie, context);
      const content = this.readChapter(page, context);
      if (content.locked) continue;

      if (passwords.markWorking(cookie)) {
        context.notice(
          `Mở khoá bằng mật khẩu #${index + 1} — ${chapter.label}.`,
        );
      }
      return content;
    }

    return null;
  }

  private fetchChapterPage(
    chapter: Chapter,
    cookie: string | undefined,
    context: DownloadContext,
  ): Promise<FetchedPage> {
    return fetchProxiedPage(chapter.url, {
      ...requestOptions(context, chapter.label),
      cookie,
    });
  }

  private readChapter(
    page: FetchedPage,
    context: DownloadContext,
  ): ChapterContent {
    const doc = parseHtml(page.html);
    const title = readChapterTitle(doc);
    if (isPasswordProtected(doc)) return { title, html: "", locked: true };

    const html = sanitize(findArticle(doc), {
      baseUrl: page.finalUrl,
      stripImages: context.stripImages,
      stripLinks: true,
      junkSelectors: THEME_JUNK,
    }).innerHTML.trim();
    if (!html) throw new Error("Nội dung chương rỗng sau khi làm sạch.");

    return { title, html, locked: false };
  }

  /** The index content minus its chapter list, so the synopsis is not a wall of links. */
  private readSynopsis(
    article: Element,
    page: FetchedPage,
    chapters: Chapter[],
    context: DownloadContext,
  ): string {
    const synopsis = article.cloneNode(true) as HTMLElement;
    removeChapterLists(synopsis, page.finalUrl, chapters);

    return sanitize(synopsis, {
      baseUrl: page.finalUrl,
      stripImages: context.stripImages,
      stripLinks: true,
      junkSelectors: THEME_JUNK,
    }).innerHTML;
  }

  private passwordsFor(context: DownloadContext): PasswordSession {
    if (!this.passwordSession || this.credential !== context.credential) {
      this.credential = context.credential;
      this.passwordSession = new PasswordSession(context.credential);
    }
    return this.passwordSession;
  }
}

function describeLockedChapter(chapter: Chapter, triedCount: number): string {
  return triedCount > 0
    ? `${chapter.label}: không mở khoá được với ${triedCount} mật khẩu đã nhập — sẽ chèn liên kết tới trang gốc.`
    : `${chapter.label}: chương yêu cầu mật khẩu — sẽ chèn liên kết tới trang gốc thay cho nội dung.`;
}

export const wordpressSource: StorySource = {
  id: "wordpress",
  name: "WordPress",
  urlPlaceholder: "https://ten-mien.wordpress.com/ten-truyen/",
  urlHint:
    "Dán liên kết trang mục lục. App quét mọi liên kết bài viết trong trang, nên mục lục chỉ đánh số “1, 2, 3…” vẫn nhận đủ chương.",
  fetchPolicy: { concurrency: 4, delayMs: 250, retries: 2 },
  credentialField: {
    label: "Mật khẩu chương bị khoá",
    placeholder: "abc | def | ghi",
    hint: "Nhiều mật khẩu cách nhau bằng dấu | — mỗi chương bị khoá sẽ thử lần lượt từng mật khẩu. Bỏ trống thì chương bị khoá xuất ra liên kết tới trang gốc.",
  },
  createSession: () => new WordpressSession(),
};
