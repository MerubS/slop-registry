import { CommentWrite, GithubReviewComment } from './github-comment';
import { isBot } from './is-bot';
import { parsePrNumber } from './parse-pr-number';

export function toCommentWrite(
  repoId: string,
  raw: GithubReviewComment,
): CommentWrite {
  if (typeof raw.id !== 'number' || !Number.isFinite(raw.id)) {
    throw new Error('GitHub comment is missing a numeric id');
  }
  if (!raw.pull_request_url) {
    throw new Error(`Comment ${raw.id} has no pull_request_url`);
  }
  if (!raw.html_url) {
    throw new Error(`Comment ${raw.id} has no html_url`);
  }

  const createdAt = new Date(raw.created_at ?? '');
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`Comment ${raw.id} has no valid created_at`);
  }

  const login = raw.user?.login?.trim();

  return {
    id: BigInt(raw.id),
    repoId,
    prNumber: parsePrNumber(raw.pull_request_url),
    // Deleted users sometimes have no login. "unknown" keeps the row so
    // the count still matches what GitHub returned.
    author: login || 'unknown',
    isBot: isBot(raw.user),
    path: raw.path?.trim() ? raw.path : null,
    body: raw.body ?? '',
    htmlUrl: raw.html_url,
    createdAt,
    inReplyToId: parseInReplyToId(raw.in_reply_to_id),
    // Keep the hunk's own whitespace. Only a blank hunk is dropped.
    diffHunk: raw.diff_hunk?.trim() ? raw.diff_hunk : null,
  };
}

// A missing or non-positive id means "this comment starts the thread".
// GitHub uses null for that. Zero and garbage must not become a parent id.
function parseInReplyToId(raw: number | null | undefined): bigint | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return BigInt(Math.trunc(raw));
}
