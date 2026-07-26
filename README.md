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
   Matching ignores Vietnamese diacritics, so _Chương 12_ and `chuong-12` both hit.
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

The handler lives in [`api/fetch.ts`](api/fetch.ts) and is the only implementation:
Vercel picks it up automatically as a serverless function at `/api/fetch`, while
[`server/proxy.ts`](server/proxy.ts) mounts the same `handle` function as Vite
middleware for local work. It has no relative imports so nothing needs resolving at
deploy time.

Because every request goes through it, the app cannot be hosted as pure static files —
it needs either the Vite server or a platform that runs the function.

## Deploying to Vercel

Push the repo to GitHub, then **Add New → Project** in Vercel and import it. The Vite
preset is detected automatically; [`vercel.json`](vercel.json) pins the build command,
output directory and the function's `maxDuration`. Or from the CLI:

```bash
npx vercel
```

No environment variables are needed. Vercel builds on Node 22, which satisfies Vite 8
(your local Node 20.15 only produces a warning).

Worth knowing before you deploy:

- **The proxy becomes public.** Anyone who finds the URL can use `/api/fetch` to fetch
  arbitrary public pages through your account. Private and loopback hosts are already
  refused, but if that matters, turn on Vercel **Deployment Protection**, or restrict
  the function to specific hostnames.
- **One function call per chapter.** An 87-chapter story is 87 invocations plus one for
  the index, which counts against the Hobby plan's free allowance.
- **4.5 MB response cap** on serverless functions. Chapter HTML is far below it; a very
  large embedded image would fail, and that image is skipped rather than breaking the
  book.
- If a deploy rejects `maxDuration: 30`, delete the `functions` block from
  `vercel.json` and the platform default applies.

## Output formats

Both formats open with the index page's own text, then the chapters.

**EPUB 3** — `mimetype` stored first and uncompressed, `META-INF/container.xml`, an OPF
package, `nav.xhtml` plus a `toc.ncx` for older readers, a generated cover, a
title/synopsis page, and one XHTML file per chapter. Chapter HTML is converted to
well-formed XHTML, since readers parse content with a strict XML parser. Images are
downloaded and embedded so the book works offline, unless you tick _Bỏ hình ảnh_.

**PDF** — title page, a clickable _Mục lục_ with real page numbers, then a _Giới thiệu_
section carrying the index page's content, then one chapter per page break, at
A4/A5/Letter. Noto Sans is embedded as a Type0/Identity-H font so Vietnamese diacritics
render correctly and text stays selectable and searchable. Images are not drawn into
the PDF; use the EPUB for illustrated stories.

The fonts in `public/fonts/` are [Noto Sans](https://github.com/googlefonts/noto-fonts)
(SIL Open Font License 1.1). `jspdf` and `jszip` are loaded on demand, so they stay out
of the initial bundle.

## Layout

| Path                            | Role                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `api/fetch.ts`                  | CORS passthrough — Vercel function and local middleware    |
| `server/proxy.ts`               | Mounts `api/fetch.ts` on the Vite dev/preview server       |
| `src/composables/useScraper.ts` | Orchestration, progress, export state                      |
| `src/lib/fetcher.ts`            | Proxy requests, retries with backoff                       |
| `src/lib/parser.ts`             | `<article>` extraction, chapter-link detection, sanitising |
| `src/lib/blocks.ts`             | HTML → linear text blocks for the PDF writer               |
| `src/lib/xhtml.ts`              | HTML → well-formed XHTML                                   |
| `src/lib/epub/`                 | EPUB 3 packaging: builder, OPF/NCX templates, images       |
| `src/lib/pdf/`                  | PDF builder: font loading, image decoding, page layout     |
| `src/lib/types.ts`              | Shared domain types and exporter contracts                 |
| `src/lib/text.ts`               | Diacritic-insensitive normalising, slugs, formatting       |
| `src/lib/async.ts`              | `runPool` — bounded-concurrency task runner                |
| `src/lib/download.ts`           | Triggers the browser save dialog for a blob                |

Formatting is fixed by Prettier (`.prettierrc.json`); run `npm run format` or
`npm run format:check`.
