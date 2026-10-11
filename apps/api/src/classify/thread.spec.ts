import { ThreadComment, repliesFor } from './thread';

function comment(
  id: number,
  inReplyToId: number | null,
  createdAt: string,
): ThreadComment {
  return {
    id: BigInt(id),
    inReplyToId: inReplyToId === null ? null : BigInt(inReplyToId),
    author: `user-${id}`,
    body: `body ${id}`,
    createdAt: new Date(createdAt),
  };
}

describe('repliesFor', () => {
  it('walks a reply-to-a-reply back to the root and sorts by time', () => {
    const comments = [
      comment(1, null, '2026-01-01T00:00:00Z'),
      comment(3, 2, '2026-01-03T00:00:00Z'),
      comment(2, 1, '2026-01-02T00:00:00Z'),
      comment(9, null, '2026-01-01T00:00:00Z'),
    ];

    const replies = repliesFor(BigInt(1), comments);
    expect(replies.map((reply) => reply.id.toString())).toEqual(['2', '3']);
    expect(replies[0].body).toBe('body 2');
  });

  it('does not attach a reply whose parent is outside the window', () => {
    const comments = [
      comment(1, null, '2026-01-01T00:00:00Z'),
      comment(4, 99, '2026-01-02T00:00:00Z'),
    ];

    expect(repliesFor(BigInt(1), comments)).toEqual([]);
  });

  it('does not follow a cycle', () => {
    const comments = [
      comment(1, null, '2026-01-01T00:00:00Z'),
      comment(5, 6, '2026-01-02T00:00:00Z'),
      comment(6, 5, '2026-01-03T00:00:00Z'),
    ];

    expect(repliesFor(BigInt(1), comments)).toEqual([]);
  });
});
