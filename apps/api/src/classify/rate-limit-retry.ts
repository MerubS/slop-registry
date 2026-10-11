// Classify and embed call OpenAI directly. A 429 means "slow down", not
// "this comment is bad". We retry those. Anything else is thrown on the
// first failure so a bad schema or a missing key does not sit in a loop.
const MAX_ATTEMPTS = 5;

export function isRateLimitError(error: unknown): boolean {
  const seen = new Set<unknown>();

  function check(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    if (seen.has(value)) return false;
    seen.add(value);

    const record = value as {
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (record.status === 429 || record.statusCode === 429) return true;
    if (typeof record.message === 'string') {
      if (
        /\b429\b/.test(record.message) ||
        /rate limit/i.test(record.message)
      ) {
        return true;
      }
    }
    return check(record.cause);
  }

  return check(error);
}

// OpenAI sometimes sets Retry-After as a number of seconds. Prefer that
// over our own backoff. An HTTP date is ignored here; the backoff covers it.
function retryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const headers = (error as { headers?: unknown }).headers;
  if (!headers || typeof headers !== 'object') return null;

  let raw: unknown;
  const asGetter = headers as { get?: (name: string) => unknown };
  if (typeof asGetter.get === 'function') {
    raw = asGetter.get('retry-after');
  } else {
    const record = headers as Record<string, unknown>;
    raw = record['retry-after'] ?? record['Retry-After'];
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null;
  return Math.min(60_000, Number(raw.trim()) * 1000);
}

function backoffMs(attempt: number): number {
  // attempt 0 -> 1s, 1 -> 2s, 2 -> 4s, then stop growing at 30s.
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnRateLimit<T>(
  work: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      await sleep(retryAfterMs(error) ?? backoffMs(attempt));
    }
  }
  throw lastError;
}
