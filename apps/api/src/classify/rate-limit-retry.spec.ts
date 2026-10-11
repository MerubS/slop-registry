import { isRateLimitError, retryOnRateLimit } from './rate-limit-retry';

function rateLimit(retryAfter?: string): Error {
  const error = new Error('429 rate limit') as Error & {
    status: number;
    headers?: { get: (name: string) => string | null };
  };
  error.status = 429;
  if (retryAfter !== undefined) {
    error.headers = {
      get: (name: string) => (name === 'retry-after' ? retryAfter : null),
    };
  }
  return error;
}

describe('retryOnRateLimit', () => {
  it('retries a 429 and returns the later success', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await retryOnRateLimit(
      () => {
        calls += 1;
        if (calls < 3) return Promise.reject(rateLimit());
        return Promise.resolve('ok');
      },
      (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    );

    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('prefers a numeric Retry-After over the backoff', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await retryOnRateLimit(
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(rateLimit('3'));
        return Promise.resolve('ok');
      },
      (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    );

    expect(sleeps).toEqual([3000]);
  });

  it('does not retry a normal failure', async () => {
    let calls = 0;
    await expect(
      retryOnRateLimit(
        () => {
          calls += 1;
          return Promise.reject(new Error('schema mismatch'));
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow('schema mismatch');
    expect(calls).toBe(1);
  });

  it('treats a wrapped cause with status 429 as a rate limit', () => {
    expect(isRateLimitError({ cause: { status: 429 } })).toBe(true);
    expect(isRateLimitError(new Error('nope'))).toBe(false);
  });
});
