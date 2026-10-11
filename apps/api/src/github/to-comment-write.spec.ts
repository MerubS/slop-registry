import { GithubReviewComment } from './github-comment';
import { toCommentWrite } from './to-comment-write';

function raw(extra: Partial<GithubReviewComment> = {}): GithubReviewComment {
  return {
    id: 10,
    user: { login: 'jainankit', type: 'User' },
    path: 'pkg/a.go',
    body: 'check nil',
    html_url: 'https://github.com/aviator-co/av/pull/1#discussion_r10',
    created_at: '2026-10-01T00:00:00Z',
    pull_request_url: 'https://api.github.com/repos/aviator-co/av/pulls/12',
    ...extra,
  };
}

describe('toCommentWrite thread fields', () => {
  it('stores a missing parent and a blank hunk as null', () => {
    const row = toCommentWrite('repo_1', raw());
    expect(row.inReplyToId).toBeNull();
    expect(row.diffHunk).toBeNull();
  });

  it('stores in_reply_to_id and keeps the hunk whitespace', () => {
    const row = toCommentWrite(
      'repo_1',
      raw({
        in_reply_to_id: 99,
        diff_hunk: '@@ -1 +1 @@\n-Close()\n+Close()\n',
      }),
    );
    expect(row.inReplyToId).toBe(99n);
    expect(row.diffHunk).toBe('@@ -1 +1 @@\n-Close()\n+Close()\n');
  });

  it('rejects a non-positive parent id and a whitespace-only hunk', () => {
    const row = toCommentWrite(
      'repo_1',
      raw({ in_reply_to_id: 0, diff_hunk: '  \n' }),
    );
    expect(row.inReplyToId).toBeNull();
    expect(row.diffHunk).toBeNull();
  });
});
