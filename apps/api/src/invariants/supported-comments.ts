// The model names the comments that state one rule. Keep only ids that are
// actually in this cluster, in stored id order. Drop the cluster unless two
// comments from two pull requests remain. An id we did not send is ignored.
// The raw cluster size is not the support count.
export function supportedComments<T extends { id: bigint; prNumber: number }>(
  comments: T[],
  returnedIds: string[],
): { comments: T[]; prCount: number } | null {
  const wanted = new Set(
    returnedIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  const kept = comments.filter((comment) => wanted.has(comment.id.toString()));
  const pullRequests = new Set(kept.map((comment) => comment.prNumber));
  if (kept.length < 2 || pullRequests.size < 2) return null;
  return { comments: kept, prCount: pullRequests.size };
}
