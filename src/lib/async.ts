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
