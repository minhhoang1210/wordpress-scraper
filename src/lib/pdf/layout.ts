import type { jsPDF } from "jspdf";
import type { Block } from "../blocks";
import type { StoryMeta } from "../types";
import type { ImageStore } from "./images";
import { FONT_FAMILY } from "./fonts";

/** CSS pixels are 1/96 in and PDF points 1/72 in, so pixels map to points at 0.75. */
const PX_TO_PT = 0.75;

/** Page geometry in points, derived once from the chosen page size. */
export interface Layout {
  marginX: number;
  marginTop: number;
  marginBottom: number;
  width: number;
  height: number;
  textWidth: number;
}

/** Type scale, all derived from the user's chosen body size. */
export interface Metrics {
  body: number;
  leading: number;
  tocLeading: number;
}

export function createLayout(doc: jsPDF): Layout {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const marginX = Math.round(width * 0.1);

  return {
    marginX,
    marginTop: Math.round(height * 0.08),
    marginBottom: Math.round(height * 0.09),
    width,
    height,
    textWidth: width - marginX * 2,
  };
}

export function createMetrics(fontSize: number): Metrics {
  return {
    body: fontSize,
    leading: fontSize * 1.5,
    tocLeading: fontSize * 1.45,
  };
}

/** The lowest y a drawing may reach before the page must break. */
function pageFloor(layout: Layout): number {
  return layout.height - layout.marginBottom;
}

/** Breaks to a new page when `needed` points would not fit below the cursor. */
export function ensureRoom(
  doc: jsPDF,
  cursor: number,
  needed: number,
  layout: Layout,
): number {
  if (cursor + needed > pageFloor(layout)) {
    doc.addPage();
    return layout.marginTop;
  }
  return cursor;
}

/** Draws a section heading and returns the cursor below it. */
export function drawSectionTitle(
  doc: jsPDF,
  title: string,
  cursor: number,
  layout: Layout,
  metrics: Metrics,
): number {
  const { body, leading } = metrics;
  doc.setFont(FONT_FAMILY, "bold").setFontSize(body * 1.35);

  for (const line of doc.splitTextToSize(title, layout.textWidth)) {
    cursor = ensureRoom(doc, cursor, body * 1.9, layout);
    doc.text(line, layout.marginX, cursor);
    cursor += body * 1.7;
  }

  return cursor + leading * 0.6;
}

export function drawBlock(
  doc: jsPDF,
  block: Block,
  cursor: number,
  layout: Layout,
  metrics: Metrics,
  images: ImageStore,
): number {
  const { body, leading } = metrics;

  if (block.type === "image") {
    return drawImage(doc, block, cursor, layout, leading, images);
  }

  if (block.type === "rule") {
    cursor = ensureRoom(doc, cursor, leading, layout);
    doc.setDrawColor(170);
    doc.line(layout.width * 0.35, cursor, layout.width * 0.65, cursor);
    return cursor + leading;
  }

  const indent =
    block.type === "quote" ? body * 1.5 : block.type === "list" ? body : 0;
  const prefix = block.type === "list" ? "•  " : "";

  switch (block.type) {
    case "heading":
      doc.setFont(FONT_FAMILY, "bold").setFontSize(body * 1.15);
      break;
    case "subheading":
      doc.setFont(FONT_FAMILY, "bold").setFontSize(body);
      break;
    case "quote":
      doc.setFont(FONT_FAMILY, "italic").setFontSize(body * 0.95);
      break;
    default:
      doc.setFont(FONT_FAMILY, "normal").setFontSize(body);
  }

  const lines: string[] = doc.splitTextToSize(
    prefix + block.text,
    layout.textWidth - indent,
  );
  for (const line of lines) {
    cursor = ensureRoom(doc, cursor, leading, layout);
    doc.text(line, layout.marginX + indent, cursor);
    cursor += leading;
  }

  return cursor + leading * 0.35;
}

/** Centres an image, scaling it to the text column and breaking the page if needed. */
function drawImage(
  doc: jsPDF,
  block: Block,
  cursor: number,
  layout: Layout,
  leading: number,
  images: ImageStore,
): number {
  const image = block.src ? images.get(block.src) : undefined;
  if (!image) return cursor;

  const maxHeight = layout.height - layout.marginTop - layout.marginBottom;

  let width = Math.min(layout.textWidth, image.width * PX_TO_PT);
  let height = (width * image.height) / image.width;

  // Never let a tall image exceed one full page.
  if (height > maxHeight) {
    height = maxHeight;
    width = (height * image.width) / image.height;
  }

  if (cursor + height > pageFloor(layout)) {
    doc.addPage();
    cursor = layout.marginTop;
  }

  const x = layout.marginX + (layout.textWidth - width) / 2;
  doc.addImage(image.dataUrl, "JPEG", x, cursor, width, height);

  return cursor + height + leading * 0.5;
}

export function drawTitlePage(
  doc: jsPDF,
  meta: StoryMeta,
  chapterCount: number,
  layout: Layout,
  metrics: Metrics,
): void {
  const { body } = metrics;
  doc.setPage(1);
  let cursor = layout.height * 0.3;

  doc.setFont(FONT_FAMILY, "bold").setFontSize(body * 2);
  for (const line of doc.splitTextToSize(meta.title, layout.textWidth)) {
    doc.text(line, layout.width / 2, cursor, { align: "center" });
    cursor += body * 2.4;
  }

  if (meta.author) {
    cursor += body;
    doc.setFont(FONT_FAMILY, "italic").setFontSize(body * 1.1);
    doc.text(meta.author, layout.width / 2, cursor, { align: "center" });
  }

  doc.setFont(FONT_FAMILY, "normal").setFontSize(body * 0.8);
  doc.setTextColor(110);
  doc.text(`${chapterCount} chương`, layout.width / 2, cursor + body * 2, {
    align: "center",
  });
  doc.text(
    meta.sourceUrl,
    layout.width / 2,
    layout.height - layout.marginBottom,
    {
      align: "center",
      maxWidth: layout.textWidth,
    },
  );
  doc.setTextColor(0);
}

/** How many contents rows fit on one page, and therefore how many pages to reserve. */
export function planToc(
  sectionCount: number,
  layout: Layout,
  metrics: Metrics,
): { rows: number; pages: number } {
  const usable = layout.height - layout.marginTop - layout.marginBottom;
  // Two rows' worth of slack absorbs the "Mục lục" heading on the first page.
  const rows = Math.max(1, Math.floor(usable / metrics.tocLeading) - 2);
  return { rows, pages: Math.max(1, Math.ceil(sectionCount / rows)) };
}

export function drawToc(
  doc: jsPDF,
  sections: { title: string }[],
  startPages: number[],
  frontPages: number,
  toc: { rows: number; pages: number },
  layout: Layout,
  metrics: Metrics,
): void {
  const { body, tocLeading } = metrics;
  const numberColumn = layout.width - layout.marginX;

  for (let page = 0; page < toc.pages; page++) {
    doc.setPage(2 + page);
    let cursor = layout.marginTop;

    if (page === 0) {
      doc.setFont(FONT_FAMILY, "bold").setFontSize(body * 1.4);
      doc.text("Mục lục", layout.marginX, cursor);
      cursor += body * 2.2;
    }

    doc.setFont(FONT_FAMILY, "normal").setFontSize(body * 0.9);

    const slice = sections.slice(page * toc.rows, (page + 1) * toc.rows);
    slice.forEach((section, offset) => {
      const index = page * toc.rows + offset;
      const pageNumber = startPages[index]; // 1-based within the body section
      const label = doc.splitTextToSize(
        section.title,
        layout.textWidth - body * 3,
      )[0];

      doc.text(label, layout.marginX, cursor);
      doc.text(String(pageNumber), numberColumn, cursor, { align: "right" });
      // Internal jump to the section's absolute page.
      doc.link(layout.marginX, cursor - body, layout.textWidth, body * 1.2, {
        pageNumber: pageNumber + frontPages,
      });
      cursor += tocLeading;
    });
  }
}

/** Stamps page numbers on body pages only, so front matter stays unnumbered. */
export function drawPageNumbers(
  doc: jsPDF,
  frontPages: number,
  bodyPages: number,
  layout: Layout,
  metrics: Metrics,
): void {
  doc.setFont(FONT_FAMILY, "normal").setFontSize(metrics.body * 0.75);
  doc.setTextColor(120);

  for (let page = frontPages + 1; page <= frontPages + bodyPages; page++) {
    doc.setPage(page);
    doc.text(
      String(page - frontPages),
      layout.width / 2,
      layout.height - layout.marginBottom / 2,
      { align: "center" },
    );
  }

  doc.setTextColor(0);
}
