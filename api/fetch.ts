import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Same-origin passthrough for targets that lack CORS headers — WordPress pages
 * and every story image. Two request shapes:
 *
 * - GET /api/fetch?url=…&cookie=… forwards a page or asset and reports the
 *   post-redirect URL in `x-final-url`.
 * - POST /api/fetch?url=<wp-login postpass>&… with a JSON body `{ fields }` submits
 *   the WordPress post-password form and returns the session cookie in
 *   `x-set-cookie`. The cookie is what unlocks protected posts; the browser cannot
 *   set the `Cookie` header itself, so it is relayed as a query parameter.
 *
 * On Vercel this file is picked up automatically at /api/fetch; locally,
 * server/proxy.ts mounts `handle` on the Vite dev/preview server.
 */

const BLOCKED_HOSTS =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

/**
 * A spoofed Chrome user-agent makes WordPress.com's bot protection return 403 —
 * a real browser UA arriving over a non-browser TLS handshake looks more
 * suspicious than an unremarkable client.
 */
const UPSTREAM_HEADERS = {
  "user-agent": "story-scraper/1.0 (+https://github.com)",
  "accept-language": "en-US,en;q=0.9,vi;q=0.8",
};

const UPSTREAM_TIMEOUT_MS = 20_000;

/** POSTing is only allowed for the password form, never arbitrary forms. */
const LOGIN_FIELD_NAMES = new Set([
  "post_password",
  "_wp_http_referer",
  "redirect_to",
  "testcookie",
  "wp-submit",
]);

function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Header values must stay single-line to be safe to forward. */
function cleanValue(value: string | null | undefined): string | undefined {
  return value && !/[\r\n]/.test(value) ? value : undefined;
}

function isPostPasswordTarget(parsed: URL): boolean {
  return (
    /\/wp-login\.php$/i.test(parsed.pathname) &&
    parsed.searchParams.get("action") === "postpass"
  );
}

function parseLoginFields(raw: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const fields = (parsed as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    return null;

  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(
    fields as Record<string, unknown>,
  )) {
    if (!LOGIN_FIELD_NAMES.has(name) || typeof value !== "string") return null;
    const cleaned = cleanValue(value);
    if (!cleaned) return null;
    result[name] = cleaned;
  }
  return result.post_password ? result : null;
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const requested = new URL(req.url ?? "/", "http://localhost");
  const target = requested.searchParams.get("url");

  if (!target) return fail(res, 400, "Thiếu tham số `url`.");

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return fail(res, 400, `URL không hợp lệ: ${target}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail(res, 400, `Giao thức không được hỗ trợ: ${parsed.protocol}`);
  }
  // Without this the deployed function would be an open relay into private networks.
  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    return fail(
      res,
      403,
      `Từ chối truy cập máy chủ nội bộ: ${parsed.hostname}`,
    );
  }

  const isLogin = req.method === "POST";
  let fields: Record<string, string> | null = null;
  if (isLogin) {
    if (!isPostPasswordTarget(parsed)) {
      return fail(res, 403, "POST chỉ hỗ trợ wp-login.php?action=postpass.");
    }
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      return fail(res, 400, "Không đọc được nội dung yêu cầu.");
    }
    fields = parseLoginFields(raw);
    if (!fields) {
      return fail(
        res,
        400,
        "Body phải là JSON { fields: { post_password: … } }.",
      );
    }
  }

  const headers: Record<string, string> = {
    ...UPSTREAM_HEADERS,
    accept: req.headers.accept ?? "*/*",
  };
  const cookie = cleanValue(requested.searchParams.get("cookie"));
  if (cookie) headers.cookie = cookie;

  try {
    const upstream = await fetch(parsed.toString(), {
      method: isLogin ? "POST" : "GET",
      headers,
      body: fields ? new URLSearchParams(fields) : undefined,
      redirect: isLogin ? "manual" : "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const body = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "application/octet-stream",
    );
    res.setHeader("x-final-url", upstream.url || parsed.toString());
    const exposed = ["x-final-url"];
    const setCookies =
      (
        upstream.headers as Headers & { getSetCookie?: () => string[] }
      ).getSetCookie?.() ??
      (upstream.headers.get("set-cookie")
        ? [upstream.headers.get("set-cookie")!]
        : []);
    if (setCookies.length > 0) {
      res.setHeader("x-set-cookie", setCookies.join("; "));
      exposed.push("x-set-cookie");
    }
    res.setHeader("access-control-expose-headers", exposed.join(", "));
    res.setHeader("cache-control", "no-store");
    res.end(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(res, 502, `Không tải được trang nguồn: ${message}`);
  }
}

export default handle;
