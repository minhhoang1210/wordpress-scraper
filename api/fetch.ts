import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * WordPress.com (and most self-hosted WP) serve pages without CORS headers, so the
 * browser cannot fetch them directly. This is a same-origin passthrough:
 * GET /api/fetch?url=<encoded absolute url>
 *
 * It returns the upstream body untouched (text or binary) and reports the final URL
 * after redirects via the `x-final-url` header, so the client can resolve relative
 * links correctly.
 *
 * This file is the only implementation. On Vercel it is picked up automatically as a
 * serverless function at /api/fetch; locally, server/proxy.ts mounts `handle` as Vite
 * dev/preview middleware. It deliberately has no relative imports so Vercel's bundler
 * has nothing to resolve beyond this single file.
 */

const BLOCKED_HOSTS =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i

/**
 * Deliberately honest headers. Spoofing a Chrome user-agent makes WordPress.com's bot
 * protection return 403 — a real browser UA arriving over a non-browser TLS handshake
 * looks more suspicious than an unremarkable client, so we identify ourselves plainly.
 */
const UPSTREAM_HEADERS = {
  'user-agent': 'wordpress-scraper/1.0 (+https://github.com)',
  'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
}

/** Kept below the function's configured maxDuration so we fail cleanly, not by timeout. */
const UPSTREAM_TIMEOUT_MS = 20_000

function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: message }))
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const requested = new URL(req.url ?? '/', 'http://localhost')
  const target = requested.searchParams.get('url')

  if (!target) return fail(res, 400, 'Thiếu tham số `url`.')

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return fail(res, 400, `URL không hợp lệ: ${target}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail(res, 400, `Giao thức không được hỗ trợ: ${parsed.protocol}`)
  }
  // Without this the deployed function would be an open relay into private networks.
  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    return fail(res, 403, `Từ chối truy cập máy chủ nội bộ: ${parsed.hostname}`)
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { ...UPSTREAM_HEADERS, accept: req.headers.accept ?? '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    const body = Buffer.from(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    res.setHeader(
      'content-type',
      upstream.headers.get('content-type') ?? 'application/octet-stream',
    )
    res.setHeader('x-final-url', upstream.url || parsed.toString())
    res.setHeader('access-control-expose-headers', 'x-final-url')
    res.setHeader('cache-control', 'no-store')
    res.end(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(res, 502, `Không tải được trang nguồn: ${message}`)
  }
}

export default handle
