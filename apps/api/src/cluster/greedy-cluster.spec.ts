import {
  DEFAULT_CLUSTER_THRESHOLD,
  cosineSimilarity,
  greedyClusters,
} from './greedy-cluster';

function item(
  id: number,
  prNumber: number,
  vector: number[],
  path = 'pkg/a.go',
) {
  return { id: BigInt(id), prNumber, path, vector };
}

// Angle in degrees from the x-axis, as a unit vector. Cosine similarity
// between two of these is the cosine of the angle between them.
function atDegrees(degrees: number): number[] {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

describe('greedy clustering', () => {
  it('uses 0.82 as the default threshold', () => {
    expect(DEFAULT_CLUSTER_THRESHOLD).toBe(0.82);
  });

  it('keeps a pair at or above the threshold from two pull requests', () => {
    const left = [1, 0];
    const right = [0.82, Math.sqrt(1 - 0.82 * 0.82)];
    const similarity = cosineSimilarity(left, right);
    expect(similarity).toBeCloseTo(0.82, 5);

    const joined = greedyClusters(
      [item(1, 10, left), item(2, 11, right)],
      similarity,
    );
    expect(joined).toHaveLength(1);
    expect(joined[0].size).toBe(2);
    expect(joined[0].prCount).toBe(2);
    expect(joined[0].commentIds.map((id) => id.toString())).toEqual(['1', '2']);

    const split = greedyClusters(
      [item(1, 10, left), item(2, 11, right)],
      similarity + 0.001,
    );
    expect(split).toEqual([]);
  });

  it('drops two similar comments that are on the same pull request', () => {
    const vector = [1, 0];
    const clusters = greedyClusters(
      [item(1, 10, vector), item(2, 10, vector)],
      0.5,
    );
    expect(clusters).toEqual([]);
  });

  it('drops a cluster that never reaches two pull requests', () => {
    const vector = [1, 0];
    const clusters = greedyClusters(
      [item(1, 10, vector), item(2, 10, vector), item(3, 10, vector)],
      DEFAULT_CLUSTER_THRESHOLD,
    );
    expect(clusters).toEqual([]);
  });

  it('keeps three comments when they cover two pull requests', () => {
    const vector = [1, 0];
    const clusters = greedyClusters(
      [item(1, 10, vector), item(2, 10, vector), item(3, 11, vector)],
      DEFAULT_CLUSTER_THRESHOLD,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(3);
    expect(clusters[0].prCount).toBe(2);
  });

  it('does not pull in a comment that is close to a member but far from the seed', () => {
    // 0 degrees and 25 degrees are similar (cosine about 0.90).
    // 0 degrees and 50 degrees are not (cosine about 0.64).
    // 25 and 50 would be similar to each other, but the seed is the
    // earliest id, so the third comment is left out.
    const clusters = greedyClusters(
      [
        item(1, 10, atDegrees(0), 'a.go'),
        item(2, 11, atDegrees(25), 'b.go'),
        item(3, 12, atDegrees(50), 'c.go'),
      ],
      0.8,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].commentIds.map((id) => id.toString())).toEqual([
      '1',
      '2',
    ]);
  });
});
