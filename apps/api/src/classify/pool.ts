// One OpenAI call per comment. A pool keeps several of those in flight
// without starting one request per row at once. CLASSIFY_CONCURRENCY
// defaults to 4. Raising it finishes faster until the account returns 429.
export function classifyConcurrency(): number {
  const raw = process.env.CLASSIFY_CONCURRENCY?.trim();
  if (!raw) return 4;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 16) {
    throw new Error(
      `CLASSIFY_CONCURRENCY must be an integer from 1 to 16, got ${raw}`,
    );
  }
  return value;
}

export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()));
}
