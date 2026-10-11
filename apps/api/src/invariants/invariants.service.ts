import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ClusterService } from '../cluster/cluster.service';
import { DEFAULT_CLUSTER_THRESHOLD } from '../cluster/complete-linkage';
import { suggestFileGlob } from '../cluster/file-glob';
import { PrismaService } from '../prisma/prisma.service';
import { findRepoOrThrow } from '../repos/find-repo';
import { InvariantView, loadInvariantViews } from './load-invariants';
import { OpenAiDrafter } from './openai-drafter';
import { supportedComments } from './supported-comments';

// Verified drafts, not raw clusters. A cluster that fails the support check
// is skipped and the next cluster is tried, until this many are stored or
// the list runs out.
export const DRAFT_LIMIT = 10;

export type DraftResult = {
  fullName: string;
  threshold: number;
  model: string;
  clusterCount: number;
  // Clusters sent to the model.
  checked: number;
  // Clusters that did not keep two supporting comments from two pull requests.
  discarded: number;
  drafted: number;
  invariants: InvariantView[];
};

type ClusterComment = {
  id: bigint;
  prNumber: number;
  path: string | null;
  body: string;
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
    const drafts = [];
    let checked = 0;
    let discarded = 0;

    for (const cluster of prepared.clusters) {
      if (drafts.length >= DRAFT_LIMIT) break;

      const comments = (await this.prisma.reviewComment.findMany({
        where: { id: { in: cluster.commentIds } },
        select: { id: true, prNumber: true, path: true, body: true },
        orderBy: { id: 'asc' },
      })) as ClusterComment[];
      if (comments.length < 2) {
        discarded += 1;
        continue;
      }

      checked += 1;
      let verdict;
      try {
        verdict = await this.drafter.verifyAndDraft({
          comments: comments.map((comment) => ({
            id: comment.id.toString(),
            prNumber: comment.prNumber,
            path: comment.path,
            body: comment.body,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BadGatewayException(
          `Stopped while verifying a cluster. ${drafts.length} drafts were built and not saved, so the previous drafts for this repo are unchanged. ${message}`,
        );
      }

      const kept = supportedComments(comments, verdict.supportingCommentIds);
      if (!kept || !verdict.title || !verdict.assertion) {
        discarded += 1;
        continue;
      }

      drafts.push({
        title: verdict.title,
        assertion: verdict.assertion,
        category: verdict.category,
        // Glob comes from the comments that state the rule, not from the
        // directory the raw cluster happened to share.
        fileGlob: suggestFileGlob(kept.comments.map((comment) => comment.path)),
        clusterSize: kept.comments.length,
        supportCount: kept.comments.length,
        prCount: kept.prCount,
        sourceCommentIds: kept.comments.map((comment) => comment.id),
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
                supportCount: draft.supportCount,
                prCount: draft.prCount,
                sourceCommentIds: draft.sourceCommentIds,
              })),
            }),
          ]),
    ]);

    const invariants = await loadInvariantViews(this.prisma, prepared.repoId);
    this.logger.log(
      `${prepared.fullName}: drafted ${invariants.length}, discarded ${discarded}, from ${prepared.clusters.length} clusters`,
    );

    return {
      fullName: prepared.fullName,
      threshold,
      model: this.drafter.modelName(),
      clusterCount: prepared.clusters.length,
      checked,
      discarded,
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
