import { errorMessage, isAbortError } from "../../errors";
import { PROXY_ENDPOINT } from "../../http";
import type { DownloadContext } from "../types";

/** Splits the `|`-separated password box into the passwords to try, in order. */
function splitPasswords(value: string): string[] {
  const unique = new Set<string>();
  for (const part of value.split("|")) {
    const password = part.trim();
    if (password) unique.add(password);
  }
  return [...unique];
}

/**
 * Password state of one story: the list to try, the session cookie each one
 * yields, and the cookie already known to unlock this blog. WordPress hands out
 * a cookie even for a wrong password, so only a refetch proves an unlock — that
 * check belongs to the caller.
 */
export class PasswordSession {
  readonly passwords: readonly string[];
  private readonly cookies = new Map<string, Promise<string | null>>();
  private readonly reported = new Set<string>();
  private workingCookie: string | null = null;

  constructor(credential: string) {
    this.passwords = splitPasswords(credential);
  }

  get cookie(): string | null {
    return this.workingCookie;
  }

  markWorking(cookie: string): boolean {
    const isNew = this.workingCookie !== cookie;
    this.workingCookie = cookie;
    return isNew;
  }

  cookieFor(
    loginUrl: string,
    password: string,
    context: DownloadContext,
  ): Promise<string | null> {
    const key = `${loginUrl}\n${password}`;
    const cached = this.cookies.get(key);
    if (cached) return cached;

    const pending = submitPasswordForm(loginUrl, password, context).catch(
      (error: unknown) => {
        this.cookies.delete(key);
        if (isAbortError(error)) throw error;
        if (!this.reported.has(key)) {
          this.reported.add(key);
          context.warn(`Không gửi được mật khẩu: ${errorMessage(error)}`);
        }
        return null;
      },
    );

    this.cookies.set(key, pending);
    return pending;
  }
}

/**
 * Submits WordPress's post-password form through the proxy and returns the
 * session cookie it sets. The browser cannot send a `Cookie` header itself, so
 * the proxy relays the cookie back in `x-set-cookie`.
 */
async function submitPasswordForm(
  loginUrl: string,
  password: string,
  context: DownloadContext,
): Promise<string | null> {
  const response = await fetch(
    `${PROXY_ENDPOINT}?url=${encodeURIComponent(loginUrl)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { post_password: password } }),
      signal: context.signal,
    },
  );

  // WordPress answers the form with a redirect, so a 3xx is the normal case;
  // what counts is whether a session cookie came back with it.
  const setCookie = response.headers.get("x-set-cookie");
  if (setCookie) return toCookiePairs(setCookie);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — không mở khoá được`);
  }
  return null;
}

/** Reduces a Set-Cookie header to `name=value` pairs, dropping attributes. */
function toCookiePairs(value: string): string | null {
  const segments = value.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_.-]*=)/);
  const seen = new Set<string>();
  const pairs: string[] = [];

  for (const segment of segments) {
    const match = /^([^=]+)=([\s\S]*)$/.exec(segment.split(";")[0].trim());
    if (!match) continue;

    const name = match[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    pairs.push(`${name}=${match[2].trim()}`);
  }

  return pairs.length > 0 ? pairs.join("; ") : null;
}
