// Fields we read from GitHub's "list review comments in a repository"
// response. in_reply_to_id is how a thread reply points at its parent.
// diff_hunk is the code the comment sits on. Both are stored. Reactions
// and line numbers are not.
export type GithubReviewComment = {
  id: number;
  user: { login?: string | null; type?: string | null } | null;
  path?: string | null;
  body?: string | null;
  html_url?: string | null;
  created_at?: string | null;
  pull_request_url?: string | null;
  in_reply_to_id?: number | null;
  diff_hunk?: string | null;
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
  inReplyToId: bigint | null;
  diffHunk: string | null;
};
