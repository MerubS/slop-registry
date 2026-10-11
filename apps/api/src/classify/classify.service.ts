import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findRepoOrThrow } from '../repos/find-repo';
import { CommentLabel } from './labels';
import { openAiModelName } from './model-name';
import { OpenAiClassifier } from './openai-classifier';
import { classifyConcurrency, mapWithConcurrency } from './pool';

export type ClassifyResult = {
  fullName: string;
  includeBots: boolean;
  model: string;
  // Rows this call was willing to send to the model.
  candidates: number;
  // Rows whose bucket was written by this call.
  labeled: number;
  // Rows skipped because a bucket was already stored.
  alreadyLabeled: number;
  failed: number;
  firstError: string | null;
};

export type ClassificationRow = {
  id: string;
  prNumber: number;
  author: string;
  isBot: boolean;
  path: string | null;
  htmlUrl: string;
  bucket: string;
  category: string | null;
  reason: string | null;
  body: string;
};

type PendingComment = {
  id: bigint;
  path: string | null;
  body: string;
};

// The service asks this object to label one comment. Tests pass a fake.
// The real one is OpenAiClassifier.
export type CommentClassifier = {
  classify: (input: {
    path: string | null;
    body: string;
  }) => Promise<CommentLabel>;
};

@Injectable()
export class ClassifyService {
  private readonly logger = new Logger(ClassifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: OpenAiClassifier,
  ) {}

  async classify(
    owner: string,
    repoName: string,
    includeBots: boolean,
    concurrency = readConcurrency(),
  ): Promise<ClassifyResult> {
    const repo = await findRepoOrThrow(this.prisma, owner, repoName);
    const fullName = repo.fullName;

    // bucket null is the cache. A row that already has a bucket is not
    // selected, so a second call does not spend another model request on it.
    // Re-ingest updates the body and leaves the bucket alone, which means an
    // edited comment keeps the old label. That is the reproducibility trade.
    const pending = await this.prisma.reviewComment.findMany({
      where: {
        repoId: repo.id,
        bucket: null,
        ...(includeBots ? {} : { isBot: false }),
      },
      select: { id: true, path: true, body: true },
      orderBy: { id: 'asc' },
    });

    const alreadyLabeled = await this.prisma.reviewComment.count({
      where: {
        repoId: repo.id,
        NOT: { bucket: null },
        ...(includeBots ? {} : { isBot: false }),
      },
    });

    let labeled = 0;
    let failed = 0;
    let firstError: string | null = null;

    await mapWithConcurrency(pending, concurrency, async (row) => {
      const outcome = await this.labelOne(row);
      if (outcome.ok) {
        labeled += 1;
        return;
      }
      failed += 1;
      if (!firstError) firstError = outcome.error;
    });

    this.logger.log(
      `${fullName}: labeled ${labeled}, already labeled ${alreadyLabeled}, failed ${failed}`,
    );

    if (failed > 0) {
      throw new BadGatewayException(
        `Labeled ${labeled} comments before a failure. ${failed} failed and were left unlabeled so a retry can pick them up. First error: ${firstError}`,
      );
    }

    return {
      fullName,
      includeBots,
      model: openAiModelName(),
      candidates: pending.length,
      labeled,
      alreadyLabeled,
      failed,
      firstError,
    };
  }

  // Spot-check rows for the results script. JSON has no bigint, so the
  // GitHub comment id is a string.
  async list(
    owner: string,
    repoName: string,
  ): Promise<{ fullName: string; comments: ClassificationRow[] }> {
    const repo = await findRepoOrThrow(this.prisma, owner, repoName);
    const rows = await this.prisma.reviewComment.findMany({
      where: { repoId: repo.id, NOT: { bucket: null } },
      select: {
        id: true,
        prNumber: true,
        author: true,
        isBot: true,
        path: true,
        htmlUrl: true,
        bucket: true,
        category: true,
        reason: true,
        body: true,
      },
      orderBy: { id: 'asc' },
    });

    return {
      fullName: repo.fullName,
      comments: rows.map((row) => ({
        id: row.id.toString(),
        prNumber: row.prNumber,
        author: row.author,
        isBot: row.isBot,
        path: row.path,
        htmlUrl: row.htmlUrl,
        bucket: row.bucket ?? '',
        category: row.category,
        reason: row.reason,
        body: row.body,
      })),
    };
  }

  private async labelOne(
    row: PendingComment,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    let label: CommentLabel;
    try {
      label = await this.classifier.classify({
        path: row.path,
        body: row.body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Comment ${row.id.toString()} was not labeled: ${message}`,
      );
      return { ok: false, error: message };
    }

    // bucket: null in the where clause means a second overlapping call that
    // already wrote the label does not overwrite it. The first writer wins.
    await this.prisma.reviewComment.updateMany({
      where: { id: row.id, bucket: null },
      data: {
        bucket: label.bucket,
        category: label.category,
        reason: label.reason,
      },
    });
    return { ok: true };
  }
}

function readConcurrency(): number {
  try {
    return classifyConcurrency();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(message);
  }
}
