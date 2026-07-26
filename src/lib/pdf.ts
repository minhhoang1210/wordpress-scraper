import type { jsPDF } from 'jspdf'
import type { Chapter, StoryMeta } from './types'
import { htmlToBlocks, type Block } from './blocks'

export type PageSize = 'a4' | 'a5' | 'letter'

export interface PdfOptions {
  pageSize: PageSize
  fontSize: number
  onProgress?: (done: number, total: number) => void
}

const FONT_FAMILY = 'NotoSans'
const FONT_FILES: { file: string; style: 'normal' | 'bold' | 'italic' }[] = [
  { file: 'NotoSans-Regular.ttf', style: 'normal' },
  { file: 'NotoSans-Bold.ttf', style: 'bold' },
  { file: 'NotoSans-Italic.ttf', style: 'italic' },
]

/** Base64-encoded TTFs, cached across exports so the fonts download only once. */
let fontCache: Promise<{ file: string; style: string; base64: string }[]> | null = null

function loadFonts() {
  fontCache ??= Promise.all(
    FONT_FILES.map(async ({ file, style }) => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
      if (!response.ok) {
        throw new Error(
          `Không tải được ${file} (HTTP ${response.status}). Tiếng Việt cần phông Noto Sans trong public/fonts.`,
        )
      }
      return { file, style, base64: toBase64(new Uint8Array(await response.arrayBuffer())) }
    }),
  ).catch((error) => {
    fontCache = null
    throw error
  })
  return fontCache
}

function toBase64(bytes: Uint8Array): string {
  // Chunked to stay well under the argument limit of String.fromCharCode.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

interface Layout {
  marginX: number
  marginTop: number
  marginBottom: number
  width: number
  height: number
  textWidth: number
}

/**
 * Renders the scraped story as a text PDF: title page, table of contents with real
 * page numbers, then one chapter per page break. Text stays selectable and
 * searchable, and Noto Sans is embedded so Vietnamese diacritics render correctly.
 */
export async function buildPdf(
  meta: StoryMeta,
  chapters: Chapter[],
  options: PdfOptions,
): Promise<Blob> {
  // jsPDF is ~600 kB; loading it on demand keeps it out of the initial bundle.
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()])

  const doc = new jsPDF({ unit: 'pt', format: options.pageSize, compress: true })
  for (const font of fonts) {
    doc.addFileToVFS(font.file, font.base64)
    doc.addFont(font.file, FONT_FAMILY, font.style)
  }

  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const marginX = Math.round(width * 0.1)
  const layout: Layout = {
    marginX,
    marginTop: Math.round(height * 0.08),
    marginBottom: Math.round(height * 0.09),
    width,
    height,
    textWidth: width - marginX * 2,
  }

  const body = options.fontSize
  const leading = body * 1.5

  // The index page's own text becomes the first section, so the PDF opens with the
  // synopsis just as the EPUB does. It is listed in the contents like a chapter.
  const sections: { title: string; html: string }[] = []
  if (meta.descriptionHtml.trim()) {
    sections.push({ title: 'Giới thiệu', html: meta.descriptionHtml })
  }
  chapters.forEach((chapter, index) => {
    sections.push({
      title: chapter.title || chapter.linkText || `Chương ${index + 1}`,
      html: chapter.html ?? '',
    })
  })

  // ---- Pass 1: section bodies, recording where each one starts ------------
  const startPages: number[] = []
  let cursor = layout.marginTop

  sections.forEach((section, index) => {
    if (index > 0) doc.addPage()
    startPages.push(doc.getNumberOfPages())
    cursor = layout.marginTop

    doc.setFont(FONT_FAMILY, 'bold').setFontSize(body * 1.35)
    for (const line of doc.splitTextToSize(section.title, layout.textWidth)) {
      cursor = ensureRoom(doc, cursor, body * 1.9, layout)
      doc.text(line, layout.marginX, cursor)
      cursor += body * 1.7
    }
    cursor += leading * 0.6

    for (const block of htmlToBlocks(section.html)) {
      cursor = drawBlock(doc, block, cursor, layout, body, leading)
    }

    options.onProgress?.(index + 1, sections.length)
  })

  const bodyPages = doc.getNumberOfPages()

  // ---- Front matter: title page + TOC, inserted ahead of the body ---------
  const tocLeading = body * 1.45
  const tocRows = Math.max(1, Math.floor((height - layout.marginTop - layout.marginBottom) / tocLeading) - 2)
  const tocPages = Math.max(1, Math.ceil(sections.length / tocRows))
  const frontPages = 1 + tocPages

  for (let i = 0; i < frontPages; i++) doc.insertPage(1)

  drawTitlePage(doc, meta, chapters.length, layout, body)
  drawToc(doc, sections, startPages, frontPages, tocPages, tocRows, layout, body, tocLeading)

  // ---- Footer page numbers on body pages only ----------------------------
  doc.setFont(FONT_FAMILY, 'normal').setFontSize(body * 0.75)
  for (let page = frontPages + 1; page <= frontPages + bodyPages; page++) {
    doc.setPage(page)
    doc.setTextColor(120)
    doc.text(String(page - frontPages), width / 2, height - layout.marginBottom / 2, {
      align: 'center',
    })
  }
  doc.setTextColor(0)

  return doc.output('blob')
}

function ensureRoom(doc: jsPDF, cursor: number, needed: number, layout: Layout): number {
  if (cursor + needed > layout.height - layout.marginBottom) {
    doc.addPage()
    return layout.marginTop
  }
  return cursor
}

function drawBlock(
  doc: jsPDF,
  block: Block,
  cursor: number,
  layout: Layout,
  body: number,
  leading: number,
): number {
  if (block.type === 'rule') {
    cursor = ensureRoom(doc, cursor, leading, layout)
    doc.setDrawColor(170)
    doc.line(layout.width * 0.35, cursor, layout.width * 0.65, cursor)
    return cursor + leading
  }

  const indent = block.type === 'quote' ? body * 1.5 : block.type === 'list' ? body : 0
  const prefix = block.type === 'list' ? '•  ' : ''

  switch (block.type) {
    case 'heading':
      doc.setFont(FONT_FAMILY, 'bold').setFontSize(body * 1.15)
      break
    case 'subheading':
      doc.setFont(FONT_FAMILY, 'bold').setFontSize(body)
      break
    case 'quote':
      doc.setFont(FONT_FAMILY, 'italic').setFontSize(body * 0.95)
      break
    default:
      doc.setFont(FONT_FAMILY, 'normal').setFontSize(body)
  }

  const lines: string[] = doc.splitTextToSize(prefix + block.text, layout.textWidth - indent)
  for (const line of lines) {
    cursor = ensureRoom(doc, cursor, leading, layout)
    doc.text(line, layout.marginX + indent, cursor)
    cursor += leading
  }

  return cursor + leading * 0.35
}

function drawTitlePage(
  doc: jsPDF,
  meta: StoryMeta,
  chapterCount: number,
  layout: Layout,
  body: number,
): void {
  doc.setPage(1)
  let cursor = layout.height * 0.3

  doc.setFont(FONT_FAMILY, 'bold').setFontSize(body * 2)
  for (const line of doc.splitTextToSize(meta.title, layout.textWidth)) {
    doc.text(line, layout.width / 2, cursor, { align: 'center' })
    cursor += body * 2.4
  }

  if (meta.author) {
    cursor += body
    doc.setFont(FONT_FAMILY, 'italic').setFontSize(body * 1.1)
    doc.text(meta.author, layout.width / 2, cursor, { align: 'center' })
  }

  doc.setFont(FONT_FAMILY, 'normal').setFontSize(body * 0.8)
  doc.setTextColor(110)
  doc.text(`${chapterCount} chương`, layout.width / 2, cursor + body * 2, { align: 'center' })
  doc.text(meta.sourceUrl, layout.width / 2, layout.height - layout.marginBottom, {
    align: 'center',
    maxWidth: layout.textWidth,
  })
  doc.setTextColor(0)
}

function drawToc(
  doc: jsPDF,
  sections: { title: string }[],
  startPages: number[],
  frontPages: number,
  tocPages: number,
  tocRows: number,
  layout: Layout,
  body: number,
  tocLeading: number,
): void {
  const numberColumn = layout.width - layout.marginX

  for (let page = 0; page < tocPages; page++) {
    doc.setPage(2 + page)
    let cursor = layout.marginTop

    if (page === 0) {
      doc.setFont(FONT_FAMILY, 'bold').setFontSize(body * 1.4)
      doc.text('Mục lục', layout.marginX, cursor)
      cursor += body * 2.2
    }

    doc.setFont(FONT_FAMILY, 'normal').setFontSize(body * 0.9)

    const slice = sections.slice(page * tocRows, (page + 1) * tocRows)
    slice.forEach((section, offset) => {
      const index = page * tocRows + offset
      const pageNumber = startPages[index] // 1-based within the body section
      const label = doc.splitTextToSize(section.title, layout.textWidth - body * 3)[0]

      doc.text(label, layout.marginX, cursor)
      doc.text(String(pageNumber), numberColumn, cursor, { align: 'right' })
      // Internal jump to the chapter's absolute page.
      doc.link(layout.marginX, cursor - body, layout.textWidth, body * 1.2, {
        pageNumber: pageNumber + frontPages,
      })
      cursor += tocLeading
    })
  }
}
