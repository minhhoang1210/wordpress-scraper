import type JSZipType from "jszip";
import type { Chapter, ExportHooks, ImageFetcher, StoryMeta } from "../types";
import { escapeXml, toXhtmlFragment, xhtmlDocument } from "../xhtml";
import { renderCover } from "../cover";
import { embedImages, type EmbeddedImage } from "./images";
import {
  buildNavBody,
  buildNcx,
  buildOpf,
  CONTAINER_XML,
  EPUB_CSS,
  type NavPoint,
} from "./templates";

export interface EpubOptions extends ExportHooks {
  /** When provided, remote <img> sources are downloaded and embedded in the book. */
  fetchImage?: ImageFetcher;
}

/** Accumulates the three parallel lists an EPUB package needs. */
class PackageBuilder {
  readonly manifest: string[] = [];
  readonly spine: string[] = [];
  readonly navPoints: NavPoint[] = [];

  addDocument(id: string, href: string, title: string): void {
    this.manifest.push(
      `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`,
    );
    this.spine.push(`<itemref idref="${id}"/>`);
    this.navPoints.push({ href, title });
  }

  addManifestItem(entry: string): void {
    this.manifest.push(entry);
  }
}

/** Chapter body for a page locked behind a password: a clickable link to it. */
function lockedBody(chapter: Chapter): string {
  const url = escapeXml(chapter.url);
  return `    <p class="locked">Chương này được bảo vệ bằng mật khẩu trên trang gốc nên nội dung không tải về được. Mở liên kết dưới đây bằng trình duyệt và nhập mật khẩu để đọc tiếp.</p>
    <p class="locked-url"><a href="${url}">${url}</a></p>`;
}

export async function buildEpub(
  meta: StoryMeta,
  chapters: Chapter[],
  options: EpubOptions = {},
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip: JSZipType = new JSZip();
  const uuid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // The mimetype entry must be first and stored uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER_XML);

  const oebps = zip.folder("OEBPS")!;
  oebps.file("style.css", EPUB_CSS);

  const pkg = new PackageBuilder();
  const images: EmbeddedImage[] = [];

  // The synopsis and every chapter body share one embedding step, so their
  // illustrations do not stay as remote URLs that break offline.
  const embed = (html: string) =>
    options.fetchImage
      ? embedImages(html, images, options.fetchImage, options)
      : Promise.resolve(html);

  const cover = await renderCover(meta.title, meta.author);
  if (cover) {
    oebps.file("images/cover.png", cover);
    pkg.addManifestItem(
      '<item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>',
    );
    oebps.file(
      "cover.xhtml",
      xhtmlDocument(
        "Bìa",
        `    <div class="cover"><img src="images/cover.png" alt="${escapeXml(meta.title)}" /></div>`,
        meta.language,
      ),
    );
    pkg.addManifestItem(
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    );
    pkg.spine.push('<itemref idref="cover" linear="no"/>');
  }

  options.onStatus?.("Đang dựng trang tiêu đề…");
  const synopsis = meta.descriptionHtml
    ? await embed(toXhtmlFragment(meta.descriptionHtml))
    : "";

  const titleBody = [
    `    <h1>${escapeXml(meta.title)}</h1>`,
    meta.author ? `    <p class="meta">${escapeXml(meta.author)}</p>` : "",
    synopsis,
    `    <p class="source">Nguồn: <a href="${escapeXml(meta.sourceUrl)}">${escapeXml(meta.sourceUrl)}</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  oebps.file(
    "title.xhtml",
    xhtmlDocument(meta.title, titleBody, meta.language),
  );
  pkg.addDocument("titlepage", "title.xhtml", meta.title);

  for (const [index, chapter] of chapters.entries()) {
    const id = `chapter-${String(index + 1).padStart(4, "0")}`;
    const href = `${id}.xhtml`;
    const title = chapter.title || chapter.linkText || `Chương ${index + 1}`;

    // Locked chapters keep their place but point back at the source page, where
    // the reader can enter the password themselves.
    const body = chapter.protected
      ? lockedBody(chapter)
      : await embed(toXhtmlFragment(chapter.html ?? ""));
    oebps.file(
      href,
      xhtmlDocument(
        title,
        `    <h1>${escapeXml(title)}</h1>\n${body}`,
        meta.language,
      ),
    );
    pkg.addDocument(id, href, title);

    options.onStatus?.(`Đang đóng gói ${index + 1}/${chapters.length}…`);
  }

  for (const image of images) {
    oebps.file(image.path, image.data);
    pkg.addManifestItem(
      `<item id="${image.id}" href="${image.path}" media-type="${escapeXml(image.mimeType)}"/>`,
    );
  }

  oebps.file(
    "nav.xhtml",
    xhtmlDocument("Mục lục", buildNavBody(pkg.navPoints), meta.language),
  );
  pkg.addManifestItem(
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  );

  oebps.file("toc.ncx", buildNcx(uuid, meta, pkg.navPoints));
  pkg.addManifestItem(
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
  );

  oebps.file(
    "content.opf",
    buildOpf({
      meta,
      uuid,
      modified,
      manifest: pkg.manifest,
      spine: pkg.spine,
      hasCover: Boolean(cover),
    }),
  );

  options.onStatus?.("Đang nén tệp EPUB…");
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
