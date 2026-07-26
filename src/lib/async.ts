export interface PoolOptions {
  /** Number of tasks in flight at once. */
  concurrency: number;
  /** Pause after each completed task, to stay polite to the source server. */
  delayMs?: number;
  signal?: AbortSignal;
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` over every item with a bounded number of workers, preserving the order
 * items are picked up. Used for both chapter downloads and image preloading.
 *
 * `task` is expected to handle its own failures: a rejection here aborts the pool,
 * which is rarely what a batch job wants.
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
