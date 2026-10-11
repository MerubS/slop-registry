import { cosineSimilarity } from './complete-linkage';

// Cutoffs reported on every cluster response. A pair at 0.85 counts in
// all three, so the gaps between them are readable without another pass.
export const CROSS_PR_SIMILARITY_CUTOFFS = [0.6, 0.7, 0.8] as const;

export type SimilarityDistribution = {
  // Highest and middle cosine over every pair of comments considered,
  // including two comments on the same pull request. Null when there are
  // fewer than two comments. Rounded to 4 decimal places, same as botShare.
  max: number | null;
  median: number | null;
  pairCount: number;
  // Pairs whose pull-request numbers differ and whose cosine is at or
  // above the cutoff. Same-PR pairs are left out of these counts.
  crossPrPairsAtOrAbove: Array<{ threshold: number; count: number }>;
};

export function similarityDistribution(
  items: Array<{ prNumber: number; vector: number[] }>,
): SimilarityDistribution {
  const scores: number[] = [];
  const crossCounts = CROSS_PR_SIMILARITY_CUTOFFS.map(() => 0);

  for (let left = 0; left < items.length; left++) {
    for (let right = left + 1; right < items.length; right++) {
      const score = cosineSimilarity(items[left].vector, items[right].vector);
      scores.push(score);
      if (items[left].prNumber === items[right].prNumber) continue;
      CROSS_PR_SIMILARITY_CUTOFFS.forEach((cutoff, index) => {
        if (score >= cutoff) crossCounts[index] += 1;
      });
    }
  }

  const crossPrPairsAtOrAbove = CROSS_PR_SIMILARITY_CUTOFFS.map(
    (threshold, index) => ({ threshold, count: crossCounts[index] }),
  );

  if (scores.length === 0) {
    return {
      max: null,
      median: null,
      pairCount: 0,
      crossPrPairsAtOrAbove,
    };
  }

  scores.sort((a, b) => a - b);
  const max = scores[scores.length - 1];
  const middle = Math.floor(scores.length / 2);
  const median =
    scores.length % 2 === 1
      ? scores[middle]
      : (scores[middle - 1] + scores[middle]) / 2;

  return {
    max: round4(max),
    median: round4(median),
    pairCount: scores.length,
    crossPrPairsAtOrAbove,
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
