// Fields we actually read from GitHub's "list review comments in a repository"
// response. The payload has more keys (diff hunk, reactions, line numbers).
// Leaving them off this type makes it obvious we do not store them.
export type GithubReviewComment = {
  id: number;
  user: { login?: string | null; type?: string | null } | null;
  path?: string | null;
  body?: string | null;
  html_url?: string | null;
  created_at?: string | null;
  pull_request_url?: string | null;
};

export type CommentWrite = {
  id: bigint;
  repoId: string;
  prNumber: number;
  author: string;
  isBot: boolean;
  path: string | null;
  body: string;
  htmlUrl: string;
  createdAt: Date;
};
