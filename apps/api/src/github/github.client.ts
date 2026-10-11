import { Injectable, Logger } from '@nestjs/common';
import { GithubReviewComment } from './github-comment';
import { nextPageUrl } from './parse-link-header';
import {
  MAX_RATE_LIMIT_WAIT_MS,
  backoffMs,
  shouldRetryGithubStatus,
} from './retry-delay';

const MAX_ATTEMPTS = 5;

export class GithubRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name);
  // Empty string is treated as unset so a blank line in .env still
  // means "call GitHub without a token".
  private readonly token = process.env.GITHUB_TOKEN?.trim() || undefined;

  constructor() {
    if (!this.token) {
      this.logger.warn(
        'GITHUB_TOKEN is unset. Using the unauthenticated limit of 60 requests per hour.',
      );
    }
  }

  async fetchReviewComments(
    owner: string,
    repo: string,
    limit: number,
  ): Promise<GithubReviewComment[]> {
    const collected: GithubReviewComment[] = [];
    let url: string | null =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/pulls/comments?sort=created&direction=desc&per_page=100`;

    while (url && collected.length < limit) {
      const response = await this.get(url);
      const page = (await response.json()) as unknown;
      if (!Array.isArray(page)) {
        throw new GithubRequestError(
          'GitHub response was not a list of comments',
          response.status,
        );
      }

      collected.push(...(page as GithubReviewComment[]));
      this.logger.log(
        `Fetched ${page.length} comments (${Math.min(collected.length, limit)}/${limit} toward the limit). ` +
          `Rate limit remaining: ${response.headers.get('x-ratelimit-remaining') ?? 'unknown'}`,
      );

      if (page.length === 0) break;
      url = nextPageUrl(response.headers.get('link'));
    }

    // The last page is 100 comments even if we only needed a few more.
    // Drop the extras so we never store past the caller's limit.
    return collected.slice(0, limit);
  }

  private async get(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'slop-registry',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const response = await fetch(url, { headers });
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      const retryAfter = response.headers.get('retry-after');

      if (response.ok) {
        if (remaining === '0') {
          const wait = backoffMs({
            retryAfter,
            rateLimitRemaining: remaining,
            rateLimitReset: reset,
            nowMs: Date.now(),
            attempt: 0,
          });
          this.assertWaitIsShort(wait, reset);
          this.logger.warn(
            `Primary rate limit is exhausted. Waiting ${wait}ms before the next page.`,
          );
          await sleep(wait);
        }
        return response;
      }

      const body = await response.text();
      if (
        !shouldRetryGithubStatus(response.status, body, remaining, retryAfter)
      ) {
        throw new GithubRequestError(
          `GitHub ${response.status}: ${trimBody(body)}`,
          response.status,
        );
      }

      const wait = backoffMs({
        retryAfter,
        rateLimitRemaining: remaining,
        rateLimitReset: reset,
        nowMs: Date.now(),
        attempt,
      });
      this.assertWaitIsShort(wait, reset);
      this.logger.warn(
        `GitHub ${response.status}. Retrying in ${wait}ms (attempt ${attempt + 1} of ${MAX_ATTEMPTS}).`,
      );
      await sleep(wait);
    }

    throw new GithubRequestError(
      `GitHub request failed after ${MAX_ATTEMPTS} attempts`,
      429,
    );
  }

  private assertWaitIsShort(waitMs: number, reset: string | null) {
    if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) return;
    const resetAt = reset
      ? new Date(Number(reset) * 1000).toISOString()
      : 'unknown';
    throw new GithubRequestError(
      `GitHub rate limit needs a ${Math.ceil(waitMs / 1000)}s wait (resets at ${resetAt}). ` +
        `This prototype waits at most ${MAX_RATE_LIMIT_WAIT_MS / 1000}s. Set GITHUB_TOKEN, or retry after the reset.`,
      429,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimBody(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 300) return oneLine;
  return `${oneLine.slice(0, 300)}…`;
}
