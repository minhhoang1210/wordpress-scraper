import { abortError } from "./errors";

export interface PoolOptions {
  concurrency: number;
  delayMs?: number;
  signal?: AbortSignal;
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` over every item with a bounded number of workers, picking items up
 * in order. A rejected `task` aborts the pool, so callers must handle their own
 * item-level failures.
 */
export async function runPool<T>(
  items: T[],
  task: (item: T, index: number) => Promise<void>,
  { concurrency, delayMs = 0, signal }: PoolOptions,
): Promise<void> {
  let cursor = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (cursor < items.length) {
        if (signal?.aborted) return;
        const index = cursor++;
        await task(items[index], index);
        if (delayMs > 0) await sleep(delayMs);
      }
    },
  );

  await Promise.all(workers);
}

/**
 * A shared brake. One 429 holds back every worker, not just the request that
 * tripped it, so the pool stops hammering a server that asked for a pause.
 */
export class RateGate {
  private until = 0;

  pause(ms: number): void {
    this.until = Math.max(this.until, Date.now() + ms);
  }

  get pausedForMs(): number {
    return Math.max(0, this.until - Date.now());
  }

  async wait(signal?: AbortSignal): Promise<void> {
    while (this.pausedForMs > 0) {
      if (signal?.aborted) throw abortError();
      await sleep(Math.min(this.pausedForMs, 250));
    }
  }
}
