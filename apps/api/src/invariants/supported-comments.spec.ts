import { supportedComments } from './supported-comments';

function comment(id: number, prNumber: number) {
  return { id: BigInt(id), prNumber, path: `file-${id}.go` };
}

describe('supportedComments', () => {
  const comments = [comment(1, 10), comment(2, 11), comment(3, 12)];

  it('keeps only the ids the model named, in stored order', () => {
    const kept = supportedComments(comments, ['3', '1', '999']);
    expect(kept?.comments.map((row) => row.id.toString())).toEqual(['1', '3']);
    expect(kept?.prCount).toBe(2);
  });

  it('drops the cluster when fewer than two pull requests remain', () => {
    const samePull = [comment(1, 10), comment(2, 10), comment(3, 11)];
    expect(supportedComments(samePull, ['1', '2'])).toBeNull();
  });

  it('drops the cluster when only one comment is named', () => {
    expect(supportedComments(comments, ['2'])).toBeNull();
    expect(supportedComments(comments, [])).toBeNull();
  });
});
