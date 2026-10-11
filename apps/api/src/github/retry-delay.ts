// This prototype will wait at most a minute. A real worker would sleep until
// X-RateLimit-Reset even if that is most of an hour. Capping here means a
// stuck reset time fails the request instead of hanging the demo.
export const MAX_RATE_LIMIT_WAIT_MS = 60_000;

export function backoffMs(options: {
  retryAfter: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  nowMs: number;
  attempt: number;
}): number {
  // Retry-After is GitHub's own answer for a secondary rate limit.
  // Prefer it over the primary-limit reset timestamp.
  const fromRetryAfter = parseRetryAfter(options.retryAfter, options.nowMs);
  if (fromRetryAfter !== null) return fromRetryAfter;

  if (options.rateLimitRemaining === '0' && options.rateLimitReset) {
    const resetMs = Number(options.rateLimitReset) * 1000;
    if (Number.isFinite(resetMs)) {
      return Math.max(0, resetMs - options.nowMs);
    }
  }

  // attempt 0 -> 1s, 1 -> 2s, 2 -> 4s, then stop growing at 30s.
  return Math.min(30_000, 1000 * 2 ** options.attempt);
}

// 403 is both "you are rate limited" and "this token cannot see the repo".
// Only the first one should be retried. 429 and 5xx always retry.
export function shouldRetryGithubStatus(
  status: number,
  body: string,
  remaining: string | null,
  retryAfter: string | null,
): boolean {
  if (status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  if (retryAfter) return true;
  if (remaining === '0') return true;
  return /rate limit/i.test(body);
}

function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  // Delta-seconds is an integer. HTTP dates contain a comma and letters.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);
  return null;
}
