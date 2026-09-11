import type JSZipType from "jszip";
import { errorMessage } from "../errors";
import type { Chapter, ExportHooks, ImageFetcher, StoryMeta } from "../types";
import { escapeXml, toXhtmlFragment, xhtmlDocument } from "../xhtml";
import { renderPlaceholderCover } from "./cover";
import {
  embedImages,
  extensionForMimeType,
  type EmbeddedImage,
} from "./images";
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

/** jszip models a subfolder as another JSZip instance rooted at that path. */
type ZipFolder = JSZipType;

const COVER_IMAGE_ID = "cover-image";

/** Accumulates the three parallel lists an EPUB package needs. */
class EpubPackage {
  readonly manifest: string[] = [];
  readonly spine: string[] = [];
  readonly navPoints: NavPoint[] = [];

  addDocument(id: string, href: string, title: string): void {
    this.addManifestItem(
      `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`,
    );
    this.spine.push(`<itemref idref="${id}"/>`);
    this.navPoints.push({ href, title });
  }

  addManifestItem(entry: string): void {
    this.manifest.push(entry);
  }

  /** The cover opens the book but stays out of the reading order and the ToC. */
  addCoverPage(href: string): void {
    this.addManifestItem(
      `<item id="cover" href="${href}" media-type="application/xhtml+xml"/>`,
    );
    this.spine.unshift('<itemref idref="cover" linear="no"/>');
  }
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

  const pkg = new EpubPackage();
  const images: EmbeddedImage[] = [];

  // The synopsis and every chapter body share one embedding step, so their
  // illustrations do not stay as remote URLs that break offline.
  const embed = (html: string) =>
    options.fetchImage
      ? embedImages(html, images, options.fetchImage, options)
      : Promise.resolve(html);

  options.onStatus?.("Đang dựng trang tiêu đề…");
  writeTitlePage(oebps, pkg, meta, await embed(synopsisOf(meta)));
  await writeChapters(oebps, pkg, meta, chapters, embed, options);

  // Chapters are written first so the cover can fall back to the story's own
  // first illustration when the source publishes no cover of its own.
  const cover = await resolveCover(meta, images, options);
  if (cover && !images.includes(cover)) images.push(cover);
  writeImages(oebps, pkg, images, cover);
  if (cover) writeCoverPage(oebps, pkg, meta, cover);

  writeNavigation(oebps, pkg, meta, uuid);
  oebps.file(
    "content.opf",
    buildOpf({
      meta,
      uuid,
      modified,
      manifest: pkg.manifest,
      spine: pkg.spine,
      coverImageId: cover?.id,
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

function synopsisOf(meta: StoryMeta): string {
  return meta.descriptionHtml ? toXhtmlFragment(meta.descriptionHtml) : "";
}

function writeTitlePage(
  oebps: ZipFolder,
  pkg: EpubPackage,
  meta: StoryMeta,
  synopsis: string,
): void {
  const body = [
    `    <h1>${escapeXml(meta.title)}</h1>`,
    meta.author ? `    <p class="meta">${escapeXml(meta.author)}</p>` : "",
    synopsis,
    `    <p class="source">Nguồn: <a href="${escapeXml(meta.sourceUrl)}">${escapeXml(meta.sourceUrl)}</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  oebps.file("title.xhtml", xhtmlDocument(meta.title, body, meta.language));
  pkg.addDocument("titlepage", "title.xhtml", meta.title);
}

async function writeChapters(
  oebps: ZipFolder,
  pkg: EpubPackage,
  meta: StoryMeta,
  chapters: Chapter[],
  embed: (html: string) => Promise<string>,
  options: EpubOptions,
): Promise<void> {
  for (const [index, chapter] of chapters.entries()) {
    const id = `chapter-${String(index + 1).padStart(4, "0")}`;
    const href = `${id}.xhtml`;
    const title = chapter.title || chapter.label || `Chương ${index + 1}`;

    const body = chapter.locked
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
}

/** Body for a chapter whose text could not be read: a link to the original page. */
function lockedBody(chapter: Chapter): string {
  const url = escapeXml(chapter.url);
  return `    <p class="locked">Không tải được nội dung chương này. Mở liên kết dưới đây để đọc trên trang gốc.</p>
    <p class="locked-url"><a href="${url}">${url}</a></p>`;
}

/**
 * Cover preference: the image the source publishes, then the first illustration
 * downloaded from the story itself, then a cover drawn from the title.
 */
async function resolveCover(
  meta: StoryMeta,
  images: EmbeddedImage[],
  options: EpubOptions,
): Promise<EmbeddedImage | null> {
  const published = await downloadCover(meta.coverUrl, options);
  if (published) return published;
  if (images.length > 0) return images[0];

  const drawn = await renderPlaceholderCover(meta.title, meta.author);
  return drawn
    ? {
        id: COVER_IMAGE_ID,
        path: "images/cover.png",
        mimeType: "image/png",
        data: drawn,
      }
    : null;
}

async function downloadCover(
  url: string | undefined,
  options: EpubOptions,
): Promise<EmbeddedImage | null> {
  if (!url || !options.fetchImage) return null;

  try {
    const { data, mimeType } = await options.fetchImage(url);
    return {
      id: COVER_IMAGE_ID,
      path: `images/cover.${extensionForMimeType(mimeType)}`,
      mimeType,
      data,
    };
  } catch (error) {
    options.onWarning?.(`Không tải được ảnh bìa: ${errorMessage(error)}`);
    return null;
  }
}

function writeImages(
  oebps: ZipFolder,
  pkg: EpubPackage,
  images: EmbeddedImage[],
  cover: EmbeddedImage | null,
): void {
  for (const image of images) {
    oebps.file(image.path, image.data);
    const coverProperty = image === cover ? ' properties="cover-image"' : "";
    pkg.addManifestItem(
      `<item id="${image.id}" href="${image.path}" media-type="${escapeXml(image.mimeType)}"${coverProperty}/>`,
    );
  }
}

function writeCoverPage(
  oebps: ZipFolder,
  pkg: EpubPackage,
  meta: StoryMeta,
  cover: EmbeddedImage,
): void {
  const body = `    <div class="cover"><img src="${escapeXml(cover.path)}" alt="${escapeXml(meta.title)}" /></div>`;
  oebps.file("cover.xhtml", xhtmlDocument("Bìa", body, meta.language));
  pkg.addCoverPage("cover.xhtml");
}

function writeNavigation(
  oebps: ZipFolder,
  pkg: EpubPackage,
  meta: StoryMeta,
  uuid: string,
): void {
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
}
