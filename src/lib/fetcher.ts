import type { FetchedDocument } from './types'

/**
 * WordPress pages carry no CORS headers, so the browser cannot fetch them directly.
 * Every request goes through the same-origin passthrough in server/proxy.ts, which is
 * mounted on both the dev and preview servers.
 */
function buildRequestUrl(target: string): string {
  return `/api/fetch?url=${encodeURIComponent(target)}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface FetchOptions {
  retries?: number
  signal?: AbortSignal
  onRetry?: (attempt: number, error: Error) => void
}

/** Fetches a page as text, retrying with exponential backoff on transient failures. */
export async function fetchPage(
  target: string,
  { retries = 2, signal, onRetry }: FetchOptions = {},
): Promise<FetchedDocument> {
  let lastError: Error = new Error('Chưa thực hiện lần tải nào.')

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    try {
      const response = await fetch(buildRequestUrl(target), {
        signal,
        headers: { accept: 'text/html,application/xhtml+xml' },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim())
      }

      return {
        html: await response.text(),
        // The proxy reports the post-redirect URL so relative links resolve correctly.
        finalUrl: response.headers.get('x-final-url') || target,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < retries) {
        onRetry?.(attempt + 1, lastError)
        await sleep(600 * 2 ** attempt)
      }
    }
  }

  throw lastError
}

/** Fetches a binary asset (used for embedding images into the EPUB). */
export async function fetchBinary(
  target: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const response = await fetch(buildRequestUrl(target), { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${target}`)

  const buffer = await response.arrayBuffer()
  const mimeType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
  return { data: new Uint8Array(buffer), mimeType }
}
