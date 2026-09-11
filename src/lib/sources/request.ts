import type { RequestOptions } from "../http";
import type { DownloadContext } from "./types";

/** Fetch options for one request of a run, reporting retries to the activity log. */
export function requestOptions(
  context: DownloadContext,
  what: string,
): RequestOptions {
  return {
    retries: context.retries,
    signal: context.signal,
    onRetry: (attempt, error) =>
      context.warn(`Thử lại ${what} (lần ${attempt}): ${error.message}`),
  };
}
