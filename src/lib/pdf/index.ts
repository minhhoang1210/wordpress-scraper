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

  // Record where each section starts, then insert front matter ahead of the body.
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

  const toc = planToc(sections.length, layout, metrics);
  const frontPages = 1 + toc.pages;
  for (let i = 0; i < frontPages; i++) doc.insertPage(1);

  drawTitlePage(doc, meta, chapters.length, layout, metrics);
  drawToc(doc, sections, startPages, frontPages, toc, layout, metrics);
  drawPageNumbers(doc, frontPages, bodyPages, layout, metrics);

  return doc.output("blob");
}

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
      blocks: chapter.protected
        ? lockedBlocks(chapter)
        : htmlToBlocks(chapter.html ?? ""),
    });
  }

  return sections;
}

/** PDF body text cannot carry link annotations, so the URL is drawn as text. */
function lockedBlocks(chapter: Chapter): Block[] {
  return [
    {
      type: "paragraph",
      text: "Chương này được bảo vệ bằng mật khẩu trên trang gốc nên nội dung không tải về được. Mở liên kết dưới đây bằng trình duyệt và nhập mật khẩu để đọc tiếp:",
    },
    { type: "subheading", text: chapter.url },
  ];
}
