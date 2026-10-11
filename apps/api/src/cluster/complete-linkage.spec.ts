import {
  DEFAULT_CLUSTER_THRESHOLD,
  completeLinkageClusters,
  cosineSimilarity,
} from './complete-linkage';

function item(
  id: number,
  prNumber: number,
  vector: number[],
  path = 'pkg/a.go',
) {
  return { id: BigInt(id), prNumber, path, vector };
}

function atDegrees(degrees: number): number[] {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

describe('complete-linkage clustering', () => {
  it('uses 0.6 as the default threshold', () => {
    expect(DEFAULT_CLUSTER_THRESHOLD).toBe(0.6);
  });

  it('keeps a pair at or above the threshold from two pull requests', () => {
    const left = [1, 0];
    const right = [0.82, Math.sqrt(1 - 0.82 * 0.82)];
    const similarity = cosineSimilarity(left, right);
    expect(similarity).toBeCloseTo(0.82, 5);

    const joined = completeLinkageClusters(
      [item(1, 10, left), item(2, 11, right)],
      similarity,
    );
    expect(joined).toHaveLength(1);
    expect(joined[0].size).toBe(2);
    expect(joined[0].prCount).toBe(2);
    expect(joined[0].commentIds.map((id) => id.toString())).toEqual(['1', '2']);

    const split = completeLinkageClusters(
      [item(1, 10, left), item(2, 11, right)],
      similarity + 0.001,
    );
    expect(split).toEqual([]);
  });

  it('drops two similar comments that are on the same pull request', () => {
    const vector = [1, 0];
    const clusters = completeLinkageClusters(
      [item(1, 10, vector), item(2, 10, vector)],
      0.5,
    );
    expect(clusters).toEqual([]);
  });

  it('keeps three comments when every pair is close and they cover two pull requests', () => {
    const vector = [1, 0];
    const clusters = completeLinkageClusters(
      [item(1, 10, vector), item(2, 10, vector), item(3, 11, vector)],
      DEFAULT_CLUSTER_THRESHOLD,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(3);
    expect(clusters[0].prCount).toBe(2);
  });

  it('does not chain a comment that is close to one member and far from another', () => {
    // A-B and B-C are about 0.87. A-C is 0.50. Seed-only clustering would
    // keep all three if B were the seed. Complete linkage keeps the tighter
    // pair and leaves C out.
    const clusters = completeLinkageClusters(
      [
        item(1, 10, atDegrees(0)),
        item(2, 11, atDegrees(30)),
        item(3, 12, atDegrees(60)),
      ],
      0.8,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].size).toBe(2);
    expect(clusters[0].commentIds.map((id) => id.toString())).toEqual([
      '1',
      '2',
    ]);
  });

  it('does not join two comments that are each close to the seed but far from each other', () => {
    // +20 and -20 degrees are both about 0.94 from 0 degrees, and about
    // 0.77 from each other. A seed-only group at 0.8 would contain all three.
    const clusters = completeLinkageClusters(
      [
        item(1, 10, atDegrees(0), 'cmd/av/a.go'),
        item(2, 11, atDegrees(20), 'cmd/av/b.go'),
        item(3, 12, atDegrees(-20), 'cmd/av/c.go'),
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
