import type { RequestOptions } from "../http";
import type { DownloadContext } from "./types";

export function requestOptions(
  context: DownloadContext,
  what: string,
): RequestOptions {
  return {
    retries: context.retries,
    signal: context.signal,
    gate: context.gate,
    onRetry: (attempt, error, waitMs) => {
      const pause =
        waitMs >= 1000 ? `, chờ ${Math.round(waitMs / 1000)} giây` : "";
      context.warn(
        `Thử lại ${what} (lần ${attempt}${pause}): ${error.message}`,
      );
    },
  };
}
