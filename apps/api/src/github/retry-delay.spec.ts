import { backoffMs, shouldRetryGithubStatus } from './retry-delay';

describe('backoffMs', () => {
  const now = Date.parse('2026-10-11T01:00:00Z');

  it('uses Retry-After seconds before the reset timestamp', () => {
    expect(
      backoffMs({
        retryAfter: '3',
        rateLimitRemaining: '0',
        rateLimitReset: String((now + 60_000) / 1000),
        nowMs: now,
        attempt: 0,
      }),
    ).toBe(3000);
  });

  it('waits until the primary rate-limit reset when remaining is 0', () => {
    expect(
      backoffMs({
        retryAfter: null,
        rateLimitRemaining: '0',
        rateLimitReset: String(now / 1000 + 12),
        nowMs: now,
        attempt: 4,
      }),
    ).toBe(12_000);
  });

  it('doubles the wait when GitHub gave no hint', () => {
    const base = {
      retryAfter: null,
      rateLimitRemaining: '40',
      rateLimitReset: null,
      nowMs: now,
    };
    expect(backoffMs({ ...base, attempt: 0 })).toBe(1000);
    expect(backoffMs({ ...base, attempt: 1 })).toBe(2000);
    expect(backoffMs({ ...base, attempt: 2 })).toBe(4000);
  });

  it('parses an HTTP-date Retry-After', () => {
    expect(
      backoffMs({
        retryAfter: 'Sun, 11 Oct 2026 01:00:05 GMT',
        rateLimitRemaining: null,
        rateLimitReset: null,
        nowMs: now,
        attempt: 0,
      }),
    ).toBe(5000);
  });
});

describe('shouldRetryGithubStatus', () => {
  it('retries 429, 5xx, and rate-limit 403s', () => {
    expect(shouldRetryGithubStatus(429, '', null, null)).toBe(true);
    expect(shouldRetryGithubStatus(503, '', null, null)).toBe(true);
    expect(
      shouldRetryGithubStatus(403, 'API rate limit exceeded', '0', null),
    ).toBe(true);
    expect(shouldRetryGithubStatus(403, 'nope', null, '2')).toBe(true);
  });

  it('does not retry a 403 that is just a permission error', () => {
    expect(
      shouldRetryGithubStatus(403, 'Resource not accessible', '59', null),
    ).toBe(false);
  });

  it('does not retry 404 or 401', () => {
    expect(shouldRetryGithubStatus(404, 'Not Found', '59', null)).toBe(false);
    expect(shouldRetryGithubStatus(401, 'Bad credentials', '59', null)).toBe(
      false,
    );
  });
});
