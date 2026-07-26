# WordPress Story Scraper

Vue 3 + TypeScript + Tailwind app that turns a WordPress story index page into a
downloadable **EPUB** or **PDF**.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## How it works

1. **Index page** — you paste a table-of-contents URL, e.g.
   `https://chanhday283.wordpress.com/sau-khi-xuyen-thanh-thien-mieu-tinh-linh-cua-giao-thao/`.
   The app reads the page's `<article>` and collects every link whose URL or anchor text
   contains `chuong`, `chap`, `chapter`, `phien-ngoai`, `ngoai-truyen` or `vi-thanh`.
   Matching ignores Vietnamese diacritics, so *Chương 12* and `chuong-12` both hit.
2. **Chapters** — each linked page is fetched with bounded concurrency, and its
   `<article>` element is extracted and cleaned (sharing widgets, related-post blocks,
   comments, scripts and navigation are stripped; relative URLs are made absolute).
   Failed chapters can be retried without redoing the rest.
3. **Download** — the collected chapters are assembled in the browser into an EPUB 3
   package or a paginated PDF.

## The CORS proxy

WordPress serves pages without `Access-Control-Allow-Origin`, so the browser cannot
fetch them directly. [`server/proxy.ts`](server/proxy.ts) adds a `GET /api/fetch?url=…`
passthrough to the Vite dev **and** preview servers. It refuses non-HTTP schemes and
private/loopback hosts, and reports the post-redirect URL via `x-final-url`.

It identifies itself honestly as `wordpress-scraper/1.0`. Spoofing a Chrome user-agent
makes WordPress.com's bot protection reply `403` — a browser UA arriving over a
non-browser TLS handshake looks worse than an unremarkable client.

Because every request goes through this middleware, the app has to be served by
`npm run dev` or `npm run preview`. A purely static deploy of `dist/` has no proxy and
every fetch will fail on CORS.

## Fixed behaviour

The UI exposes one scraping toggle, **Bỏ hình ảnh** (remove images). Everything else is
fixed in [`src/lib/types.ts`](src/lib/types.ts) (`FIXED`): chapter links are restricted
to the index page's own host, sorted by chapter number whenever every link yields one,
and flattened to plain text inside chapter bodies. Concurrency (4), request delay
(250 ms) and retries (2) are constants in `useScraper`.

## Output formats

Both formats open with the index page's own text, then the chapters.

**EPUB 3** — `mimetype` stored first and uncompressed, `META-INF/container.xml`, an OPF
package, `nav.xhtml` plus a `toc.ncx` for older readers, a generated cover, a
title/synopsis page, and one XHTML file per chapter. Chapter HTML is converted to
well-formed XHTML, since readers parse content with a strict XML parser. Images are
downloaded and embedded so the book works offline, unless you tick *Bỏ hình ảnh*.

**PDF** — title page, a clickable *Mục lục* with real page numbers, then a *Giới thiệu*
section carrying the index page's content, then one chapter per page break, at
A4/A5/Letter. Noto Sans is embedded as a Type0/Identity-H font so Vietnamese diacritics
render correctly and text stays selectable and searchable. Images are not drawn into
the PDF; use the EPUB for illustrated stories.

The fonts in `public/fonts/` are [Noto Sans](https://github.com/googlefonts/noto-fonts)
(SIL Open Font License 1.1). `jspdf` and `jszip` are loaded on demand, so they stay out
of the initial bundle.

## Layout

| Path | Role |
| --- | --- |
| `server/proxy.ts` | Dev/preview CORS passthrough |
| `src/lib/fetcher.ts` | Proxy requests, retries with backoff |
| `src/lib/parser.ts` | `<article>` extraction, chapter-link detection, sanitising |
| `src/lib/epub.ts` | EPUB 3 packaging |
| `src/lib/pdf.ts` | PDF typesetting and font embedding |
| `src/lib/blocks.ts` | HTML → linear text blocks for the PDF writer |
| `src/lib/xhtml.ts` | HTML → well-formed XHTML |
| `src/composables/useScraper.ts` | Orchestration, progress, export state |

## Note

This only retrieves what the site already serves publicly. Respect the source site's
terms and the author's rights — keep the output for personal reading.
