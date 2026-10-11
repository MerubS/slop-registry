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
import { PromptReply } from './prompt';
import { classifyConcurrency, mapWithConcurrency } from './pool';
import { repliesFor } from './thread';

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
  // Thread replies matching the same bot filter. They are not review
  // feedback, so they are not sent and they are not part of candidates.
  skippedReplies: number;
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

type LoadedComment = {
  id: bigint;
  inReplyToId: bigint | null;
  path: string | null;
  body: string;
  diffHunk: string | null;
  author: string;
  isBot: boolean;
  bucket: string | null;
  createdAt: Date;
};

type PendingComment = {
  id: bigint;
  path: string | null;
  body: string;
  diffHunk: string | null;
  replies: PromptReply[];
};

// The service asks this object to label one comment. Tests pass a fake.
// The real one is OpenAiClassifier. Replies and the diff hunk are context.
export type CommentClassifier = {
  classify: (input: {
    path: string | null;
    body: string;
    diffHunk: string | null;
    replies: PromptReply[];
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

    // Load every comment on the repo. Replies, including bot replies, are
    // context for the root even when includeBots is false. The bot filter
    // applies to which roots we label, not to which replies we show.
    //
    // bucket null is the cache. A top-level row that already has a bucket
    // is not sent again. Re-ingest updates the body and leaves the bucket
    // alone, which means an edited comment keeps the old label.
    const loaded = (await this.prisma.reviewComment.findMany({
      where: { repoId: repo.id },
      select: {
        id: true,
        inReplyToId: true,
        path: true,
        body: true,
        diffHunk: true,
        author: true,
        isBot: true,
        bucket: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    })) as LoadedComment[];

    const inScope = loaded.filter((row) => includeBots || !row.isBot);
    // Null means "top of the thread". A set inReplyToId is a reply, even
    // when the parent is outside this window.
    const replies = inScope.filter((row) => isReply(row.inReplyToId));
    const topLevel = inScope.filter((row) => !isReply(row.inReplyToId));
    const alreadyLabeled = topLevel.filter((row) => row.bucket !== null).length;
    const pending: PendingComment[] = topLevel
      .filter((row) => row.bucket === null)
      .sort((left, right) => compareId(left.id, right.id))
      .map((row) => ({
        id: row.id,
        path: row.path,
        body: row.body,
        diffHunk: row.diffHunk,
        replies: repliesFor(row.id, loaded).map((reply) => ({
          author: reply.author,
          body: reply.body,
        })),
      }));

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
      `${fullName}: labeled ${labeled}, already labeled ${alreadyLabeled}, replies skipped ${replies.length}, failed ${failed}`,
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
      skippedReplies: replies.length,
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
      where: { repoId: repo.id, inReplyToId: null, NOT: { bucket: null } },
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
        diffHunk: row.diffHunk,
        replies: row.replies,
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

function isReply(inReplyToId: bigint | null | undefined): boolean {
  return typeof inReplyToId === 'bigint';
}

function compareId(left: bigint, right: bigint): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function readConcurrency(): number {
  try {
    return classifyConcurrency();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(message);
  }
}
