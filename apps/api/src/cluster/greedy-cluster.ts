export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// 0.6 is the default after the first aviator-co/av run. That run used 0.82
// and kept zero clusters: across 169 non-noise comments the maximum
// pairwise cosine was 0.772, so the gate sat above every pair. Six
// cross-PR pairs scored at least 0.60 and one scored at least 0.70.
// 0.6 is the cutoff that run still had a few recurring pairs at. It will
// also join short comments that only share a phrase. The query parameter
// overrides it, and the cluster response reports the distribution so the
// next cutoff can be explained by that run. See the explainer.
export const DEFAULT_CLUSTER_THRESHOLD = 0.6;

export type ClusterItem = {
  id: bigint;
  prNumber: number;
  path: string | null;
  vector: number[];
};

export type CommentCluster = {
  commentIds: bigint[];
  paths: (string | null)[];
  size: number;
  prCount: number;
};

// Greedy, seeded by the earliest comment id.
//
// Walk the comments in id order. The first comment that is not yet in a
// cluster becomes the seed. Every later unassigned comment whose cosine
// similarity to that seed is >= threshold joins it. Those comments do not
// get to start their own cluster, and they are not compared with each
// other. A comment that is close to a member but far from the seed stays
// out. That is the limitation of seeding on one comment instead of
// averaging the group.
//
// A group is kept only when it has at least two comments and those
// comments come from at least two pull requests. Five copies of the same
// note on one PR are one review conversation, not a recurring team rule.
// Aviator's docs describe worthwhile invariants as comments left more
// than twice; two different PRs is the smallest version of "recurring".
export function greedyClusters(
  items: ClusterItem[],
  threshold: number,
): CommentCluster[] {
  const ordered = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const used = new Set<string>();
  const clusters: CommentCluster[] = [];

  for (const seed of ordered) {
    const seedKey = seed.id.toString();
    if (used.has(seedKey)) continue;

    const members: ClusterItem[] = [seed];
    used.add(seedKey);

    for (const other of ordered) {
      const otherKey = other.id.toString();
      if (used.has(otherKey)) continue;
      if (cosineSimilarity(seed.vector, other.vector) >= threshold) {
        members.push(other);
        used.add(otherKey);
      }
    }

    const pullRequests = new Set(members.map((member) => member.prNumber));
    if (members.length >= 2 && pullRequests.size >= 2) {
      clusters.push({
        commentIds: members.map((member) => member.id),
        paths: members.map((member) => member.path),
        size: members.length,
        prCount: pullRequests.size,
      });
    }
  }

  clusters.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    if (b.prCount !== a.prCount) return b.prCount - a.prCount;
    if (a.commentIds[0] < b.commentIds[0]) return -1;
    if (a.commentIds[0] > b.commentIds[0]) return 1;
    return 0;
  });

  return clusters;
}
