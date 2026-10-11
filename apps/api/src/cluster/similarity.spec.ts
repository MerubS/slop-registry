import { cosineSimilarity } from './greedy-cluster';
import { similarityDistribution } from './similarity';

describe('similarityDistribution', () => {
  it('returns null max and median when there are fewer than two comments', () => {
    const none = similarityDistribution([]);
    expect(none.max).toBeNull();
    expect(none.median).toBeNull();
    expect(none.pairCount).toBe(0);
    expect(none.crossPrPairsAtOrAbove).toEqual([
      { threshold: 0.6, count: 0 },
      { threshold: 0.7, count: 0 },
      { threshold: 0.8, count: 0 },
    ]);

    const one = similarityDistribution([{ prNumber: 1, vector: [1, 0] }]);
    expect(one.pairCount).toBe(0);
    expect(one.max).toBeNull();
  });

  it('counts every pair for max and median, and only cross-PR pairs at the cutoffs', () => {
    const anchor = [1, 0];
    const near = [0.65, Math.sqrt(1 - 0.65 * 0.65)];
    const cross = cosineSimilarity(anchor, near);
    expect(cross).toBeGreaterThanOrEqual(0.6);
    expect(cross).toBeLessThan(0.7);

    const report = similarityDistribution([
      { prNumber: 10, vector: anchor },
      { prNumber: 10, vector: anchor },
      { prNumber: 11, vector: near },
    ]);

    // Three pairs: the two on PR 10 are cosine 1, and each of those against
    // PR 11 is about 0.65. Max includes the same-PR pair. The cutoff counts
    // do not.
    expect(report.pairCount).toBe(3);
    expect(report.max).toBe(1);
    expect(report.median).toBeCloseTo(cross, 3);
    expect(report.crossPrPairsAtOrAbove).toEqual([
      { threshold: 0.6, count: 2 },
      { threshold: 0.7, count: 0 },
      { threshold: 0.8, count: 0 },
    ]);
  });

  it('counts a pair at 0.85 in every cross-PR cutoff', () => {
    const report = similarityDistribution([
      { prNumber: 1, vector: [1, 0] },
      { prNumber: 2, vector: [1, 0] },
    ]);
    expect(report.max).toBe(1);
    expect(report.median).toBe(1);
    expect(report.crossPrPairsAtOrAbove.map((row) => row.count)).toEqual([
      1, 1, 1,
    ]);
  });
});
