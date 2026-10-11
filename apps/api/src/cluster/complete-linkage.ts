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

// 0.6 is the minimum cosine between every pair inside a cluster.
//
// Run 1 embedded the body alone and kept nothing at 0.82: the maximum
// pairwise cosine was 0.772, one cross-PR pair was at least 0.70, and six
// were at least 0.60. Run 2 kept 22 clusters at 0.6, but that 0.6 was
// "similar to the seed" on vectors that started with the file path, so
// comments in the same directory chained together. Complete linkage applies
// 0.6 to every pair, which is the tight reading of the same number. Raising
// it above 0.7 would sit on top of the body-only pairs run 1 actually
// measured. The query parameter still overrides it.
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

// Agglomerative complete linkage.
//
// Start with one comment per group. Merge the two groups whose weakest
// pair is still at or above the threshold, highest similarity first. After
// a merge, the link to any other group is the weaker of the two old links,
// so a comment joins only when it is close to every member, not merely to
// the seed. That is what stops a chain (A near B, B near C, A far from C)
// from becoming one cluster.
//
// Ties merge the pair whose smallest comment id is smaller, then the pair
// whose other id is smaller. The same vectors always produce the same groups.
//
// A group is kept only when it has at least two comments from at least two
// pull requests. Five copies of one note on a single PR are one review, not
// a recurring team rule.
export function completeLinkageClusters(
  items: ClusterItem[],
  threshold: number,
): CommentCluster[] {
  const points = [...items].sort((left, right) => compareId(left.id, right.id));
  const count = points.length;
  if (count === 0) return [];

  const cosine: number[][] = Array.from({ length: count }, () =>
    Array<number>(count).fill(1),
  );
  for (let left = 0; left < count; left++) {
    for (let right = left + 1; right < count; right++) {
      const value = cosineSimilarity(points[left].vector, points[right].vector);
      cosine[left][right] = value;
      cosine[right][left] = value;
    }
  }

  let groups: number[][] = points.map((_, index) => [index]);
  let link = cosine.map((row) => row.slice());

  while (groups.length > 1) {
    let bestLeft = -1;
    let bestRight = -1;
    let bestSimilarity = Number.NEGATIVE_INFINITY;

    for (let left = 0; left < groups.length; left++) {
      for (let right = left + 1; right < groups.length; right++) {
        const similarity = link[left][right];
        if (similarity < threshold) continue;
        if (
          bestLeft < 0 ||
          preferMerge(
            similarity,
            groups[left],
            groups[right],
            bestSimilarity,
            groups[bestLeft],
            groups[bestRight],
            points,
          )
        ) {
          bestLeft = left;
          bestRight = right;
          bestSimilarity = similarity;
        }
      }
    }

    if (bestLeft < 0) break;

    const merged = [...groups[bestLeft], ...groups[bestRight]];
    const kept = groups
      .map((_, index) => index)
      .filter((index) => index !== bestLeft && index !== bestRight);
    const nextGroups = kept.map((index) => groups[index]);
    nextGroups.push(merged);

    const nextLink: number[][] = Array.from({ length: nextGroups.length }, () =>
      Array<number>(nextGroups.length).fill(1),
    );
    for (let left = 0; left < kept.length; left++) {
      for (let right = left + 1; right < kept.length; right++) {
        const value = link[kept[left]][kept[right]];
        nextLink[left][right] = value;
        nextLink[right][left] = value;
      }
      const toMerged = Math.min(
        link[kept[left]][bestLeft],
        link[kept[left]][bestRight],
      );
      const mergedIndex = nextGroups.length - 1;
      nextLink[left][mergedIndex] = toMerged;
      nextLink[mergedIndex][left] = toMerged;
    }

    groups = nextGroups;
    link = nextLink;
  }

  const clusters: CommentCluster[] = [];
  for (const group of groups) {
    const members = group
      .map((index) => points[index])
      .sort((left, right) => compareId(left.id, right.id));
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

  clusters.sort((left, right) => {
    if (right.size !== left.size) return right.size - left.size;
    if (right.prCount !== left.prCount) return right.prCount - left.prCount;
    return compareId(left.commentIds[0], right.commentIds[0]);
  });

  return clusters;
}

function preferMerge(
  similarity: number,
  left: number[],
  right: number[],
  bestSimilarity: number,
  bestLeft: number[],
  bestRight: number[],
  points: ClusterItem[],
): boolean {
  if (similarity > bestSimilarity) return true;
  if (similarity < bestSimilarity) return false;

  const [leftLow, leftHigh] = orderedIds(left, right, points);
  const [bestLow, bestHigh] = orderedIds(bestLeft, bestRight, points);
  if (leftLow < bestLow) return true;
  if (bestLow < leftLow) return false;
  return leftHigh < bestHigh;
}

function orderedIds(
  left: number[],
  right: number[],
  points: ClusterItem[],
): [bigint, bigint] {
  const leftId = smallestId(left, points);
  const rightId = smallestId(right, points);
  if (leftId < rightId) return [leftId, rightId];
  return [rightId, leftId];
}

function smallestId(group: number[], points: ClusterItem[]): bigint {
  let smallest = points[group[0]].id;
  for (const index of group) {
    if (points[index].id < smallest) smallest = points[index].id;
  }
  return smallest;
}

function compareId(left: bigint, right: bigint): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
