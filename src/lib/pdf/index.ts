import type { Block } from "../blocks";
import type { Chapter, ExportHooks, ImageFetcher, StoryMeta } from "../types";
import { htmlToBlocks } from "../blocks";
import { FONT_FAMILY, loadFonts } from "./fonts";
import { preloadImages } from "./images";
import {
  createLayout,
  createMetrics,
  drawBlock,
  drawPageNumbers,
  drawSectionTitle,
  drawTitlePage,
  drawToc,
  planToc,
} from "./layout";

export type PageSize = "a4" | "a5" | "letter";

export interface PdfOptions extends ExportHooks {
  pageSize: PageSize;
  fontSize: number;
  /** Supplies image bytes through the proxy; omit to build a text-only PDF. */
  fetchImage?: ImageFetcher;
}

interface Section {
  title: string;
  blocks: Block[];
}

/**
 * Renders the scraped story as a PDF: title page, a contents list with real page
 * numbers and internal links, the index page's synopsis, then one chapter per page
 * break. Text stays selectable and searchable because Noto Sans is embedded rather
 * than the pages being rasterised.
 */
export async function buildPdf(
  meta: StoryMeta,
  chapters: Chapter[],
  options: PdfOptions,
): Promise<Blob> {
  // jsPDF is ~400 kB; loading it on demand keeps it out of the initial bundle.
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), loadFonts()]);

  const doc = new jsPDF({
    unit: "pt",
    format: options.pageSize,
    compress: true,
  });
  for (const font of fonts) {
    doc.addFileToVFS(font.file, font.base64);
    doc.addFont(font.file, FONT_FAMILY, font.style);
  }

  const layout = createLayout(doc);
  const metrics = createMetrics(options.fontSize);
  const sections = buildSections(meta, chapters);
  const images = await preloadImages(sections, options.fetchImage, options);

  // ---- Body: sections in order, recording where each one starts --------------
  const startPages = sections.map((section, index) => {
    if (index > 0) doc.addPage();
    const startPage = doc.getNumberOfPages();

    let cursor = drawSectionTitle(
      doc,
      section.title,
      layout.marginTop,
      layout,
      metrics,
    );
    for (const block of section.blocks) {
      cursor = drawBlock(doc, block, cursor, layout, metrics, images);
    }

    options.onStatus?.(`Đang dàn trang ${index + 1}/${sections.length}…`);
    return startPage;
  });

  const bodyPages = doc.getNumberOfPages();

  // ---- Front matter, inserted ahead of the body once its length is known -----
  const toc = planToc(sections.length, layout, metrics);
  const frontPages = 1 + toc.pages;
  for (let i = 0; i < frontPages; i++) doc.insertPage(1);

  drawTitlePage(doc, meta, chapters.length, layout, metrics);
  drawToc(doc, sections, startPages, frontPages, toc, layout, metrics);
  drawPageNumbers(doc, frontPages, bodyPages, layout, metrics);

  return doc.output("blob");
}

/**
 * The index page's own text becomes the first section, so the PDF opens with the
 * synopsis just as the EPUB does, and it is listed in the contents like a chapter.
 */
function buildSections(meta: StoryMeta, chapters: Chapter[]): Section[] {
  const sections: Section[] = [];

  if (meta.descriptionHtml.trim()) {
    sections.push({
      title: "Giới thiệu",
      blocks: htmlToBlocks(meta.descriptionHtml),
    });
  }

  for (const [index, chapter] of chapters.entries()) {
    sections.push({
      title: chapter.title || chapter.linkText || `Chương ${index + 1}`,
      blocks: htmlToBlocks(chapter.html ?? ""),
    });
  }

  return sections;
}
