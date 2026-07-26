import type JSZipType from 'jszip'
import type { Chapter, StoryMeta } from './types'
import { escapeXml, toXhtmlFragment, xhtmlDocument } from './xhtml'
import { renderCover } from './cover'

export interface EpubImageFetcher {
  (url: string): Promise<{ data: Uint8Array; mimeType: string }>
}

export interface EpubOptions {
  /** When provided, remote <img> sources are downloaded and embedded in the book. */
  fetchImage?: EpubImageFetcher
  onProgress?: (message: string) => void
}

const EPUB_CSS = `@charset "utf-8";

body {
  margin: 5% 6%;
  line-height: 1.65;
  text-align: justify;
  font-family: Georgia, "Times New Roman", serif;
}

h1, h2 {
  text-align: center;
  line-height: 1.3;
  page-break-after: avoid;
  font-weight: normal;
}

h1 { font-size: 1.5em; margin: 1.5em 0 1.2em; }
h2 { font-size: 1.25em; margin: 1.2em 0 1em; }

p { margin: 0 0 0.85em; text-indent: 1.2em; }
p:first-of-type { text-indent: 0; }

blockquote { margin: 1em 2em; font-style: italic; }
hr { border: none; border-top: 1px solid #999; margin: 2em 20%; }
img { max-width: 100%; height: auto; }

.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; height: auto; }
.meta { text-align: center; color: #555; font-style: italic; margin-bottom: 2em; }
.source { font-size: 0.85em; color: #777; text-align: center; margin-top: 3em; }
`

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

interface EmbeddedImage {
  path: string
  id: string
  mimeType: string
  data: Uint8Array
}

/** Builds a valid EPUB 3 package (with an EPUB 2 NCX for older readers). */
export async function buildEpub(
  meta: StoryMeta,
  chapters: Chapter[],
  options: EpubOptions = {},
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip: JSZipType = new JSZip()
  const uuid = `urn:uuid:${crypto.randomUUID()}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  // The mimetype entry must be first and stored uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  )

  const oebps = zip.folder('OEBPS')!
  oebps.file('style.css', EPUB_CSS)

  const images: EmbeddedImage[] = []
  const manifest: string[] = []
  const spine: string[] = []
  const navPoints: { href: string; title: string }[] = []

  // ---- Cover -------------------------------------------------------------
  const cover = await renderCover(meta.title, meta.author)
  if (cover) {
    oebps.file('images/cover.png', cover)
    manifest.push(
      '<item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>',
    )
    oebps.file(
      'cover.xhtml',
      xhtmlDocument(
        'Cover',
        `    <div class="cover"><img src="images/cover.png" alt="${escapeXml(meta.title)}" /></div>`,
        meta.language,
      ),
    )
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>')
    spine.push('<itemref idref="cover" linear="no"/>')
  }

  // ---- Title / synopsis page --------------------------------------------
  // The synopsis needs the same image embedding as a chapter body, otherwise its
  // illustrations stay as remote URLs and break when the book is read offline.
  let synopsis = meta.descriptionHtml ? toXhtmlFragment(meta.descriptionHtml) : ''
  if (synopsis && options.fetchImage) {
    synopsis = await embedImages(synopsis, images, options)
  }

  const titleBody = [
    `    <h1>${escapeXml(meta.title)}</h1>`,
    meta.author ? `    <p class="meta">${escapeXml(meta.author)}</p>` : '',
    synopsis,
    `    <p class="source">Nguồn: <a href="${escapeXml(meta.sourceUrl)}">${escapeXml(meta.sourceUrl)}</a></p>`,
  ]
    .filter(Boolean)
    .join('\n')

  oebps.file('title.xhtml', xhtmlDocument(meta.title, titleBody, meta.language))
  manifest.push('<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>')
  spine.push('<itemref idref="titlepage"/>')
  navPoints.push({ href: 'title.xhtml', title: meta.title })

  // ---- Chapters ----------------------------------------------------------
  for (const [index, chapter] of chapters.entries()) {
    const id = `chapter-${String(index + 1).padStart(4, '0')}`
    const href = `${id}.xhtml`
    const title = chapter.title || chapter.linkText || `Chapter ${index + 1}`

    let body = toXhtmlFragment(chapter.html ?? '')
    if (options.fetchImage) {
      body = await embedImages(body, images, options)
    }

    oebps.file(
      href,
      xhtmlDocument(
        title,
        `    <h1>${escapeXml(title)}</h1>\n${body}`,
        meta.language,
      ),
    )
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="${id}"/>`)
    navPoints.push({ href, title })
  }

  for (const image of images) {
    oebps.file(image.path, image.data)
    manifest.push(
      `<item id="${image.id}" href="${image.path}" media-type="${escapeXml(image.mimeType)}"/>`,
    )
  }

  // ---- Navigation --------------------------------------------------------
  const navList = navPoints
    .map((point) => `        <li><a href="${escapeXml(point.href)}">${escapeXml(point.title)}</a></li>`)
    .join('\n')

  oebps.file(
    'nav.xhtml',
    xhtmlDocument(
      'Table of Contents',
      `    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
${navList}
      </ol>
    </nav>`,
      meta.language,
    ),
  )
  manifest.push(
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  )

  oebps.file('toc.ncx', buildNcx(uuid, meta, navPoints))
  manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')

  // ---- Package -----------------------------------------------------------
  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(meta.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(uuid)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
${meta.author ? `    <dc:creator>${escapeXml(meta.author)}</dc:creator>\n` : ''}    <dc:language>${escapeXml(meta.language)}</dc:language>
    <dc:source>${escapeXml(meta.sourceUrl)}</dc:source>
    <dc:date>${modified}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
${cover ? '    <meta name="cover" content="cover-image"/>\n' : ''}  </metadata>
  <manifest>
${manifest.map((entry) => `    ${entry}`).join('\n')}
  </manifest>
  <spine toc="ncx">
${spine.map((entry) => `    ${entry}`).join('\n')}
  </spine>
</package>
`,
  )

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

function buildNcx(
  uuid: string,
  meta: StoryMeta,
  navPoints: { href: string; title: string }[],
): string {
  const points = navPoints
    .map(
      (point, index) => `    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(point.title)}</text></navLabel>
      <content src="${escapeXml(point.href)}"/>
    </navPoint>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(uuid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(meta.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`
}

/** Downloads each remote image once and rewrites its src to a book-relative path. */
async function embedImages(
  bodyXhtml: string,
  images: EmbeddedImage[],
  options: EpubOptions,
): Promise<string> {
  const doc = new DOMParser().parseFromString(`<div id="__root">${bodyXhtml}</div>`, 'text/html')
  const root = doc.getElementById('__root')!
  const targets = Array.from(root.querySelectorAll('img[src]'))
  if (targets.length === 0) return bodyXhtml

  const cache = new Map(images.map((image) => [image.id, image.path]))

  for (const img of targets) {
    const src = img.getAttribute('src')!
    if (!/^https?:/i.test(src)) continue

    const key = `img-${await hashUrl(src)}`
    const existing = cache.get(key)
    if (existing) {
      img.setAttribute('src', existing)
      continue
    }

    try {
      const { data, mimeType } = await options.fetchImage!(src)
      const extension = MIME_EXTENSIONS[mimeType] ?? 'jpg'
      const path = `images/${key}.${extension}`
      images.push({ id: key, path, mimeType, data })
      cache.set(key, path)
      img.setAttribute('src', path)
    } catch (error) {
      options.onProgress?.(
        `Bỏ qua ảnh ${src}: ${error instanceof Error ? error.message : String(error)}`,
      )
      img.remove()
    }
  }

  return toXhtmlFragment(root.innerHTML)
}

async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url))
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
