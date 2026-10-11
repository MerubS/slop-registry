import { GithubReviewComment } from '../github/github-comment';
import { GithubClient } from '../github/github.client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestService } from './ingest.service';

// This stands in for Postgres. The Map key is the comment id, which is the
// same identity as ReviewComment's primary key. It is not a test of SQL.
// The day-1 run against Postgres is what proves the database agrees.
function memoryPrisma() {
  const repos = new Map<string, { id: string; fullName: string }>();
  const comments = new Map<
    string,
    {
      id: bigint;
      repoId: string;
      body: string;
      bucket?: string | null;
    }
  >();
  const updateKeys: string[][] = [];
  const createKeys: string[][] = [];

  const prisma = {
    repo: {
      upsert: ({
        where,
        create,
      }: {
        where: { fullName: string };
        create: { fullName: string };
      }) => {
        const existing = repos.get(where.fullName);
        if (existing) return existing;
        const row = { id: `repo_${repos.size + 1}`, fullName: create.fullName };
        repos.set(row.fullName, row);
        return row;
      },
    },
    reviewComment: {
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { id: bigint };
        create: { id: bigint; repoId: string; body: string };
        update: Record<string, unknown>;
      }) => {
        updateKeys.push(Object.keys(update));
        createKeys.push(Object.keys(create));
        const key = where.id.toString();
        const existing = comments.get(key);
        if (existing) {
          comments.set(key, {
            ...existing,
            body: String(update.body),
            repoId: String(update.repoId),
            bucket: Object.prototype.hasOwnProperty.call(update, 'bucket')
              ? (update.bucket as string | null)
              : existing.bucket,
          });
        } else {
          comments.set(key, {
            id: create.id,
            repoId: create.repoId,
            body: create.body,
          });
        }
        return { id: where.id };
      },
      count: ({ where }: { where: { repoId: string } }) => {
        let n = 0;
        for (const row of comments.values()) {
          if (row.repoId === where.repoId) n += 1;
        }
        return n;
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { prisma, comments, updateKeys, createKeys };
}

function comment(id: number, body = `comment ${id}`): GithubReviewComment {
  return {
    id,
    user: {
      login: id % 2 === 0 ? 'coderabbitai[bot]' : 'jainankit',
      type: 'User',
    },
    path: 'cmd/av/main.go',
    body,
    html_url: `https://github.com/aviator-co/av/pull/1#discussion_r${id}`,
    created_at: '2026-10-01T00:00:00Z',
    pull_request_url: 'https://api.github.com/repos/aviator-co/av/pulls/12',
  };
}

describe('IngestService idempotency', () => {
  it('ingesting the same comments twice keeps the same count', async () => {
    const { prisma, updateKeys, createKeys } = memoryPrisma();
    const pages = [comment(1), comment(2), comment(3)];
    const github = {
      fetchReviewComments: () => pages,
    };

    const service = new IngestService(
      prisma as unknown as PrismaService,
      github as unknown as GithubClient,
    );

    const first = await service.ingest('aviator-co', 'av', 500);
    const second = await service.ingest('aviator-co', 'av', 500);

    expect(first).toEqual({
      fullName: 'aviator-co/av',
      requested: 500,
      received: 3,
      totalStored: 3,
    });
    expect(second.totalStored).toBe(3);
    expect(second.received).toBe(3);

    for (const keys of updateKeys) {
      expect(keys).not.toContain('bucket');
      expect(keys).not.toContain('category');
      expect(keys).not.toContain('reason');
      expect(keys).not.toContain('embedding');
      expect(keys).toContain('inReplyToId');
      expect(keys).toContain('diffHunk');
    }
    for (const keys of createKeys) {
      expect(keys).toContain('inReplyToId');
      expect(keys).toContain('diffHunk');
      expect(keys).not.toContain('bucket');
    }
  });

  it('counts an overlapping second pull once per comment id', async () => {
    const { prisma, comments } = memoryPrisma();
    const pulls = [
      [comment(1), comment(2)],
      [comment(2, 'edited body'), comment(3)],
    ];
    let call = 0;
    const github = {
      fetchReviewComments: () => pulls[call++],
    };

    const service = new IngestService(
      prisma as unknown as PrismaService,
      github as unknown as GithubClient,
    );

    const first = await service.ingest('aviator-co', 'av', 500);
    comments.get('2')!.bucket = 'deterministic';
    const second = await service.ingest('aviator-co', 'av', 500);

    expect(first.totalStored).toBe(2);
    expect(second.totalStored).toBe(3);
    expect(comments.get('2')?.body).toBe('edited body');
    expect(comments.get('2')?.bucket).toBe('deterministic');
  });
});
