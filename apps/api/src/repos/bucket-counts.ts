// Fold of the groupBy rows from ReviewComment. Human counts ignore bots.
// A bucket we do not recognize is unlabeled, same as a null bucket, so a
// typo in the column cannot pretend to be one of Ankit's three buckets.
export type BucketCounts = {
  deterministic: number;
  execution_testable: number;
  judgment: number;
  noise: number;
  unlabeled: number;
};

const KNOWN = [
  'deterministic',
  'execution_testable',
  'judgment',
  'noise',
] as const;

type KnownBucket = (typeof KNOWN)[number];

export function emptyBucketCounts(): BucketCounts {
  return {
    deterministic: 0,
    execution_testable: 0,
    judgment: 0,
    noise: 0,
    unlabeled: 0,
  };
}

export function bucketCountsFromGroups(
  groups: Array<{ isBot: boolean; bucket: string | null; count: number }>,
): { human: BucketCounts; all: BucketCounts } {
  const human = emptyBucketCounts();
  const all = emptyBucketCounts();

  for (const group of groups) {
    const key: KnownBucket | 'unlabeled' =
      KNOWN.find((name) => name === group.bucket) ?? 'unlabeled';
    all[key] += group.count;
    if (!group.isBot) human[key] += group.count;
  }

  return { human, all };
}
