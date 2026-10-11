import { PrismaService } from '../prisma/prisma.service';

export type EvidenceLink = {
  commentId: string;
  prNumber: number;
  htmlUrl: string;
};

export type InvariantView = {
  id: string;
  title: string;
  assertion: string;
  category: string | null;
  fileGlob: string | null;
  // Supporting comments, not the raw cluster. clusterSize is the same
  // number, kept so the original column still sorts.
  clusterSize: number;
  supportCount: number;
  // Distinct pull requests among the supporting comments.
  prCount: number;
  sourceCommentIds: string[];
  evidence: EvidenceLink[];
};

// One shape for the summary, the YAML export, and the Markdown export.
// A source id with no row is omitted. We do not invent a URL.
export async function loadInvariantViews(
  prisma: PrismaService,
  repoId: string,
): Promise<InvariantView[]> {
  const rows = await prisma.invariant.findMany({
    where: { repoId },
    orderBy: [{ prCount: 'desc' }, { supportCount: 'desc' }, { id: 'asc' }],
  });

  const ids = rows.flatMap((row) => row.sourceCommentIds);
  const comments =
    ids.length === 0
      ? []
      : await prisma.reviewComment.findMany({
          where: { id: { in: ids } },
          select: { id: true, prNumber: true, htmlUrl: true },
        });
  const byId = new Map(
    comments.map((comment) => [comment.id.toString(), comment]),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    assertion: row.assertion,
    category: row.category,
    fileGlob: row.fileGlob,
    clusterSize: row.clusterSize,
    supportCount: row.supportCount,
    prCount: row.prCount,
    sourceCommentIds: row.sourceCommentIds.map((id) => id.toString()),
    evidence: row.sourceCommentIds.flatMap((id) => {
      const comment = byId.get(id.toString());
      if (!comment) return [];
      return [
        {
          commentId: id.toString(),
          prNumber: comment.prNumber,
          htmlUrl: comment.htmlUrl,
        },
      ];
    }),
  }));
}
