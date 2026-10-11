import { PrismaService } from '../prisma/prisma.service';
import { ClassifyService, CommentClassifier } from './classify.service';

type Stored = {
  id: bigint;
  repoId: string;
  path: string | null;
  body: string;
  diffHunk: string | null;
  inReplyToId: bigint | null;
  isBot: boolean;
  bucket: string | null;
  category: string | null;
  reason: string | null;
  prNumber: number;
  author: string;
  htmlUrl: string;
  createdAt: Date;
};

// Same idea as the ingest test: a Map stands in for Postgres. It is not a
// test of SQL. It checks which rows the service sends to the model.
function memoryPrisma() {
  const comments = new Map<string, Stored>();

  function matches(
    row: Stored,
    where: {
      repoId?: string;
      bucket?: null;
      isBot?: boolean;
      NOT?: { bucket: null };
      id?: bigint;
    },
  ): boolean {
    if (where.repoId !== undefined && row.repoId !== where.repoId) return false;
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.isBot !== undefined && row.isBot !== where.isBot) return false;
    if (
      Object.prototype.hasOwnProperty.call(where, 'bucket') &&
      where.bucket === null
    ) {
      if (row.bucket !== null) return false;
    }
    if (where.NOT?.bucket === null && row.bucket === null) return false;
    return true;
  }

  const prisma = {
    repo: {
      findUnique: ({ where }: { where: { fullName: string } }) => {
        if (where.fullName !== 'aviator-co/av') return null;
        return { id: 'repo_1', fullName: where.fullName };
      },
    },
    reviewComment: {
      findMany: ({
        where,
      }: {
        where: {
          repoId?: string;
          bucket?: null;
          isBot?: boolean;
          NOT?: { bucket: null };
        };
      }) => {
        return [...comments.values()].filter((row) => matches(row, where));
      },
      count: ({
        where,
      }: {
        where: {
          repoId?: string;
          isBot?: boolean;
          NOT?: { bucket: null };
        };
      }) => {
        return [...comments.values()].filter((row) => matches(row, where))
          .length;
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: bigint; bucket: null };
        data: { bucket: string; category: string; reason: string };
      }) => {
        const row = comments.get(where.id.toString());
        if (!row || row.bucket !== null) return { count: 0 };
        row.bucket = data.bucket;
        row.category = data.category;
        row.reason = data.reason;
        return { count: 1 };
      },
    },
  };

  return { prisma, comments };
}

function row(id: number, extra: Partial<Stored> = {}): Stored {
  return {
    id: BigInt(id),
    repoId: 'repo_1',
    path: 'pkg/stack/stack.go',
    body: `comment ${id}`,
    diffHunk: null,
    inReplyToId: null,
    isBot: false,
    bucket: null,
    category: null,
    reason: null,
    prNumber: id,
    author: 'jainankit',
    htmlUrl: `https://github.com/aviator-co/av/pull/1#discussion_r${id}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

describe('ClassifyService caching', () => {
  it('does not send a comment that already has a bucket', async () => {
    const { prisma, comments } = memoryPrisma();
    comments.set('1', row(1));
    comments.set('2', row(2, { bucket: 'judgment', reason: 'kept' }));
    comments.set('3', row(3, { isBot: true, author: 'coderabbitai[bot]' }));

    const seen: string[] = [];
    const classifier: CommentClassifier = {
      classify: (input) => {
        seen.push(input.body);
        return Promise.resolve({
          bucket: 'deterministic',
          category: 'code_style',
          reason: 'A linter can catch this.',
        });
      },
    };

    const service = new ClassifyService(
      prisma as unknown as PrismaService,
      classifier as unknown as ClassifyService['classifier'],
    );

    const first = await service.classify('aviator-co', 'av', false, 2);
    expect(first.labeled).toBe(1);
    expect(first.alreadyLabeled).toBe(1);
    expect(first.candidates).toBe(1);
    expect(seen).toEqual(['comment 1']);
    expect(comments.get('1')?.bucket).toBe('deterministic');
    expect(comments.get('2')?.bucket).toBe('judgment');
    expect(comments.get('2')?.reason).toBe('kept');
    expect(comments.get('3')?.bucket).toBeNull();

    seen.length = 0;
    const second = await service.classify('aviator-co', 'av', false, 2);
    expect(second.labeled).toBe(0);
    expect(second.alreadyLabeled).toBe(2);
    expect(second.candidates).toBe(0);
    expect(seen).toEqual([]);
  });

  it('labels unlabeled bots only when includeBots is set', async () => {
    const { prisma, comments } = memoryPrisma();
    comments.set('3', row(3, { isBot: true, author: 'coderabbitai[bot]' }));

    const seen: string[] = [];
    const classifier: CommentClassifier = {
      classify: (input) => {
        seen.push(input.body);
        return Promise.resolve({
          bucket: 'noise',
          category: 'code_style',
          reason: 'The comment is only a greeting.',
        });
      },
    };

    const service = new ClassifyService(
      prisma as unknown as PrismaService,
      classifier as unknown as ClassifyService['classifier'],
    );

    const skipped = await service.classify('aviator-co', 'av', false, 1);
    expect(skipped.candidates).toBe(0);
    expect(seen).toEqual([]);

    const included = await service.classify('aviator-co', 'av', true, 1);
    expect(included.labeled).toBe(1);
    expect(seen).toEqual(['comment 3']);
    expect(comments.get('3')?.bucket).toBe('noise');
  });

  it('does not classify a reply, and passes the reply plus the diff hunk to the root', async () => {
    const { prisma, comments } = memoryPrisma();
    comments.set(
      '1',
      row(1, { body: 'nil-check Close()', diffHunk: '@@\n-Close()' }),
    );
    comments.set(
      '2',
      row(2, {
        body: 'Close() checks nil itself now',
        inReplyToId: BigInt(1),
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    );
    comments.set(
      '3',
      row(3, {
        body: 'already handled',
        isBot: true,
        author: 'coderabbitai[bot]',
        inReplyToId: BigInt(1),
        createdAt: new Date('2026-01-03T00:00:00Z'),
      }),
    );

    const seen: Array<{
      body: string;
      diffHunk: string | null;
      replies: Array<{ body: string }>;
    }> = [];
    const classifier: CommentClassifier = {
      classify: (input) => {
        seen.push(input);
        return Promise.resolve({
          bucket: 'deterministic',
          category: 'functional_correctness',
          reason: 'A nil check is a static rule.',
        });
      },
    };

    const service = new ClassifyService(
      prisma as unknown as PrismaService,
      classifier as unknown as ClassifyService['classifier'],
    );

    const result = await service.classify('aviator-co', 'av', false, 2);
    expect(result.candidates).toBe(1);
    expect(result.labeled).toBe(1);
    expect(result.skippedReplies).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].body).toBe('nil-check Close()');
    expect(seen[0].diffHunk).toBe('@@\n-Close()');
    expect(seen[0].replies.map((reply) => reply.body)).toEqual([
      'Close() checks nil itself now',
      'already handled',
    ]);
    expect(comments.get('2')?.bucket).toBeNull();
    expect(comments.get('3')?.bucket).toBeNull();
  });
});
