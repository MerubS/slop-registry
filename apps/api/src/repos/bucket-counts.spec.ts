import { bucketCountsFromGroups } from './bucket-counts';

describe('bucketCountsFromGroups', () => {
  it('counts humans and everyone separately, and treats unknown buckets as unlabeled', () => {
    const counts = bucketCountsFromGroups([
      { isBot: false, bucket: 'deterministic', count: 10 },
      { isBot: false, bucket: 'execution_testable', count: 5 },
      { isBot: false, bucket: 'judgment', count: 3 },
      { isBot: false, bucket: 'noise', count: 2 },
      { isBot: false, bucket: null, count: 4 },
      { isBot: true, bucket: 'noise', count: 7 },
      { isBot: true, bucket: 'not-a-bucket', count: 1 },
    ]);

    expect(counts.human).toEqual({
      deterministic: 10,
      execution_testable: 5,
      judgment: 3,
      noise: 2,
      unlabeled: 4,
    });
    expect(counts.all).toEqual({
      deterministic: 10,
      execution_testable: 5,
      judgment: 3,
      noise: 9,
      unlabeled: 5,
    });
  });
});
