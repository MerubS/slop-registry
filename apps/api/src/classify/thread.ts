// One stored review comment, as far as threading needs to see it.
export type ThreadComment = {
  id: bigint;
  inReplyToId: bigint | null;
  author: string;
  body: string;
  createdAt: Date;
};

export type ThreadReply = {
  id: bigint;
  author: string;
  body: string;
};

// Replies that belong under a top-level comment.
//
// GitHub's in_reply_to_id points at the parent, which may be the root or
// another reply. Walk parents until a comment with no parent. That comment
// is the root. A missing parent means the reply's root is outside this
// window: do not attach it to some other local comment. The reply is still
// excluded from classification because its own inReplyToId is set.
// A cycle (a comment pointing at itself, or a loop) does not attach either.
export function repliesFor(
  rootId: bigint,
  comments: ThreadComment[],
): ThreadReply[] {
  const byId = new Map(
    comments.map((comment) => [comment.id.toString(), comment]),
  );
  const rootKey = rootId.toString();

  const replies = comments.filter((comment) => {
    if (comment.id === rootId) return false;
    if (comment.inReplyToId === null) return false;
    return rootOf(comment, byId) === rootKey;
  });

  replies.sort((left, right) => {
    const time = left.createdAt.getTime() - right.createdAt.getTime();
    if (time !== 0) return time;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });

  return replies.map((comment) => ({
    id: comment.id,
    author: comment.author,
    body: comment.body,
  }));
}

function rootOf(
  comment: ThreadComment,
  byId: Map<string, ThreadComment>,
): string | null {
  const seen = new Set<string>();
  let current: ThreadComment | undefined = comment;
  while (current) {
    const key = current.id.toString();
    if (seen.has(key)) return null;
    seen.add(key);
    if (current.inReplyToId === null) return key;
    const parent = byId.get(current.inReplyToId.toString());
    if (!parent) return null;
    current = parent;
  }
  return null;
}
