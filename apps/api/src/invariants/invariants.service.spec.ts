import { CommentCluster } from '../cluster/complete-linkage';
import { ClusterService } from '../cluster/cluster.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvariantsService } from './invariants.service';
import { OpenAiDrafter } from './openai-drafter';
import { VerifiedDraft } from './draft';

type StoredComment = {
  id: bigint;
  prNumber: number;
  path: string | null;
  body: string;
  htmlUrl: string;
};

type StoredDraft = {
  id: string;
  repoId: string;
  title: string;
  assertion: string;
  category: string | null;
  fileGlob: string | null;
  clusterSize: number;
  supportCount: number;
  prCount: number;
  sourceCommentIds: bigint[];
};

function memoryPrisma(comments: StoredComment[]) {
  const drafts: StoredDraft[] = [];
  let nextId = 1;

  const prisma = {
    reviewComment: {
      findMany: ({ where }: { where: { id: { in: bigint[] } } }) =>
        comments.filter((comment) =>
          where.id.in.some((id) => id === comment.id),
        ),
    },
    invariant: {
      deleteMany: () => {
        drafts.length = 0;
        return { count: 0 };
      },
      createMany: ({ data }: { data: Array<Omit<StoredDraft, 'id'>> }) => {
        for (const row of data) {
          drafts.push({ ...row, id: `inv_${nextId}` });
          nextId += 1;
        }
        return { count: data.length };
      },
      findMany: () =>
        [...drafts].sort(
          (left, right) =>
            right.prCount - left.prCount ||
            right.supportCount - left.supportCount ||
            left.id.localeCompare(right.id),
        ),
    },
    $transaction: (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };

  return { prisma, drafts };
}

function comment(
  id: number,
  prNumber: number,
  path: string,
  body: string,
): StoredComment {
  return {
    id: BigInt(id),
    prNumber,
    path,
    body,
    htmlUrl: `https://github.com/aviator-co/av/pull/${prNumber}#discussion_r${id}`,
  };
}

function cluster(ids: number[]): CommentCluster {
  return {
    commentIds: ids.map((id) => BigInt(id)),
    paths: [],
    size: ids.length,
    prCount: ids.length,
  };
}

function prepared(clusters: CommentCluster[]) {
  return {
    fullName: 'aviator-co/av',
    repoId: 'repo_1',
    threshold: 0.6,
    embeddedThisRun: 0,
    alreadyEmbedded: 0,
    skippedEmptyBody: 0,
    commentsConsidered: 0,
    similarity: {
      max: null,
      median: null,
      pairCount: 0,
      crossPrPairsAtOrAbove: [],
    },
    clusters,
  };
}

describe('InvariantsService verification', () => {
  it('drafts from the supporting comments and skips a cluster that does not share a rule', async () => {
    const comments = [
      comment(1, 10, 'docs/a.md', 'Spell GitHub, never Github'),
      comment(2, 11, 'docs/b.md', 'GitHub needs a capital H'),
      comment(3, 12, 'cmd/av/main.go', 'error messages must be clear'),
      comment(4, 13, 'internal/git/git.go', 'nit'),
      comment(5, 13, 'internal/git/client.go', 'same pull request'),
    ];
    const { prisma, drafts } = memoryPrisma(comments);
    const seen: string[][] = [];
    const drafter = {
      modelName: () => 'gpt-4o-mini',
      verifyAndDraft: (input: {
        comments: Array<{ id: string }>;
      }): Promise<VerifiedDraft> => {
        const ids = input.comments.map((row) => row.id);
        seen.push(ids);
        if (ids.includes('1')) {
          return Promise.resolve({
            supportingCommentIds: ['1', '2'],
            title: 'Spell GitHub',
            assertion: 'Spell GitHub with a capital H.',
            category: 'documentation',
          });
        }
        return Promise.resolve({
          supportingCommentIds: ['4', '5'],
          title: 'One pull request',
          assertion: 'This only shows up once.',
          category: 'code_style',
        });
      },
    };

    const clusters = {
      prepare: () =>
        Promise.resolve(prepared([cluster([1, 2, 3]), cluster([4, 5])])),
    };

    const service = new InvariantsService(
      prisma as unknown as PrismaService,
      clusters as unknown as ClusterService,
      drafter as unknown as OpenAiDrafter,
    );

    const result = await service.draft('aviator-co', 'av', 0.6);
    expect(seen).toEqual([
      ['1', '2', '3'],
      ['4', '5'],
    ]);
    expect(result.checked).toBe(2);
    expect(result.discarded).toBe(1);
    expect(result.drafted).toBe(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].fileGlob).toBe('docs/**/*.md');
    expect(drafts[0].supportCount).toBe(2);
    expect(drafts[0].prCount).toBe(2);
    expect(drafts[0].clusterSize).toBe(2);
    expect(drafts[0].sourceCommentIds.map((id) => id.toString())).toEqual([
      '1',
      '2',
    ]);
    expect(result.invariants[0].evidence.map((link) => link.commentId)).toEqual(
      ['1', '2'],
    );
    expect(result.invariants[0].prCount).toBe(2);
  });

  it('stores at most ten verified drafts', async () => {
    const comments: StoredComment[] = [];
    const clustersIn: CommentCluster[] = [];
    for (let index = 0; index < 11; index++) {
      const left = index * 2 + 1;
      const right = left + 1;
      comments.push(
        comment(left, left, 'docs/a.md', 'Spell GitHub'),
        comment(right, right, 'docs/b.md', 'GitHub, not Github'),
      );
      clustersIn.push(cluster([left, right]));
    }
    const { prisma, drafts } = memoryPrisma(comments);
    const drafter = {
      modelName: () => 'gpt-4o-mini',
      verifyAndDraft: (input: {
        comments: Array<{ id: string }>;
      }): Promise<VerifiedDraft> =>
        Promise.resolve({
          supportingCommentIds: input.comments.map((row) => row.id),
          title: 'Spell GitHub',
          assertion: 'Spell GitHub with a capital H.',
          category: 'documentation',
        }),
    };
    const service = new InvariantsService(
      prisma as unknown as PrismaService,
      {
        prepare: () => Promise.resolve(prepared(clustersIn)),
      } as unknown as ClusterService,
      drafter as unknown as OpenAiDrafter,
    );

    const result = await service.draft('aviator-co', 'av', 0.6);
    expect(result.drafted).toBe(10);
    expect(drafts).toHaveLength(10);
    expect(result.checked).toBe(10);
    expect(result.discarded).toBe(0);
  });
});
