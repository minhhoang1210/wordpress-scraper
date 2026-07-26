import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

/**
 * WordPress.com (and most self-hosted WP) serve pages without CORS headers, so the
 * browser cannot fetch them directly. This middleware is a same-origin passthrough:
 * GET /api/fetch?url=<encoded absolute url>
 *
 * It streams the upstream body back untouched (text or binary) and reports the final
 * URL after redirects via the `x-final-url` header so the client can resolve relative
 * links correctly.
 */

const BLOCKED_HOSTS = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i

/**
 * Deliberately honest headers. Spoofing a Chrome user-agent makes WordPress.com's bot
 * protection return 403 — a real browser UA arriving over a non-browser TLS handshake
 * looks more suspicious than an unremarkable client, so we identify ourselves plainly.
 */
const UPSTREAM_HEADERS = {
  'user-agent': 'wordpress-scraper/1.0 (+local tool)',
  'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
}

function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: message }))
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const requested = new URL(req.url ?? '/', 'http://localhost')
  const target = requested.searchParams.get('url')

  if (!target) return fail(res, 400, 'Missing `url` query parameter.')

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return fail(res, 400, `Not a valid absolute URL: ${target}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail(res, 400, `Unsupported protocol: ${parsed.protocol}`)
  }
  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    return fail(res, 403, `Refusing to proxy a private/loopback host: ${parsed.hostname}`)
  }

  const timeout = AbortSignal.timeout(45_000)

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { ...UPSTREAM_HEADERS, accept: req.headers.accept ?? '*/*' },
      redirect: 'follow',
      signal: timeout,
    })

    const body = Buffer.from(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.setHeader('x-final-url', upstream.url || parsed.toString())
    res.setHeader('access-control-expose-headers', 'x-final-url')
    res.setHeader('cache-control', 'no-store')
    res.end(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(res, 502, `Upstream fetch failed: ${message}`)
  }
}

const middleware: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith('/api/fetch')) return next()
  void handle(req, res)
}

/** Registers the passthrough for both `vite dev` and `vite preview`. */
export function wordpressProxy(): Plugin {
  return {
    name: 'wordpress-scraper-proxy',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
