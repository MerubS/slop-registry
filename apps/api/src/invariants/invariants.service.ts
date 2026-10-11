import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ClusterService } from '../cluster/cluster.service';
import { suggestFileGlob } from '../cluster/file-glob';
import { DEFAULT_CLUSTER_THRESHOLD } from '../cluster/greedy-cluster';
import { PrismaService } from '../prisma/prisma.service';
import { findRepoOrThrow } from '../repos/find-repo';
import { InvariantView, loadInvariantViews } from './load-invariants';
import { OpenAiDrafter } from './openai-drafter';

// The page and the results doc show ten. Smaller clusters are still stored
// on the cluster response; they just do not get a draft.
export const DRAFT_LIMIT = 10;

export type DraftResult = {
  fullName: string;
  threshold: number;
  model: string;
  clusterCount: number;
  drafted: number;
  invariants: InvariantView[];
};

@Injectable()
export class InvariantsService {
  private readonly logger = new Logger(InvariantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clusters: ClusterService,
    private readonly drafter: OpenAiDrafter,
  ) {}

  async draft(
    owner: string,
    repoName: string,
    threshold = DEFAULT_CLUSTER_THRESHOLD,
  ): Promise<DraftResult> {
    const prepared = await this.clusters.prepare(owner, repoName, threshold);
    const top = prepared.clusters.slice(0, DRAFT_LIMIT);
    const drafts = [];

    for (const cluster of top) {
      const comments = await this.prisma.reviewComment.findMany({
        where: { id: { in: cluster.commentIds } },
        select: { id: true, prNumber: true, path: true, body: true },
        orderBy: { id: 'asc' },
      });
      if (comments.length === 0) continue;

      const fileGlob = suggestFileGlob(comments.map((comment) => comment.path));
      let drafted;
      try {
        drafted = await this.drafter.draft({
          fileGlob,
          clusterSize: cluster.size,
          comments: comments.map((comment) => ({
            prNumber: comment.prNumber,
            path: comment.path,
            body: comment.body,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BadGatewayException(
          `Stopped while drafting invariants. ${drafts.length} drafts were built and not saved, so the previous drafts for this repo are unchanged. ${message}`,
        );
      }

      drafts.push({
        title: drafted.title,
        assertion: drafted.assertion,
        category: drafted.category,
        fileGlob,
        clusterSize: cluster.size,
        // Evidence is the whole cluster, not only the eight excerpts the
        // model saw. The links have to point at every comment we grouped.
        sourceCommentIds: cluster.commentIds,
      });
    }

    // Replace, do not append. A second run with the same comments should
    // not stack a second copy of every draft. The text can still change:
    // temperature 0 is not a promise that the provider returns the same
    // tokens after a model update. Labels are cached. Draft text is not.
    await this.prisma.$transaction([
      this.prisma.invariant.deleteMany({ where: { repoId: prepared.repoId } }),
      ...(drafts.length === 0
        ? []
        : [
            this.prisma.invariant.createMany({
              data: drafts.map((draft) => ({
                repoId: prepared.repoId,
                title: draft.title,
                assertion: draft.assertion,
                category: draft.category,
                fileGlob: draft.fileGlob,
                clusterSize: draft.clusterSize,
                sourceCommentIds: draft.sourceCommentIds,
              })),
            }),
          ]),
    ]);

    const invariants = await loadInvariantViews(this.prisma, prepared.repoId);
    this.logger.log(
      `${prepared.fullName}: drafted ${invariants.length} invariants from ${prepared.clusters.length} clusters`,
    );

    return {
      fullName: prepared.fullName,
      threshold,
      model: this.drafter.modelName(),
      clusterCount: prepared.clusters.length,
      drafted: invariants.length,
      invariants,
    };
  }

  async list(
    owner: string,
    repoName: string,
  ): Promise<{
    fullName: string;
    invariants: InvariantView[];
  }> {
    const repo = await findRepoOrThrow(this.prisma, owner, repoName);
    return {
      fullName: repo.fullName,
      invariants: await loadInvariantViews(this.prisma, repo.id),
    };
  }
}
