import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findRepoOrThrow } from '../repos/find-repo';
import {
  ClusterItem,
  CommentCluster,
  DEFAULT_CLUSTER_THRESHOLD,
  greedyClusters,
} from './greedy-cluster';
import { OpenAiEmbedder } from './openai-embedder';
import { SimilarityDistribution, similarityDistribution } from './similarity';
import { textToEmbed } from './text-to-embed';
import {
  EMBEDDING_DIMENSIONS,
  parseVectorLiteral,
  toVectorLiteral,
} from './vector-literal';

const EMBED_BATCH = 64;

export type ClusterSummary = {
  size: number;
  prCount: number;
  commentIds: string[];
};

export type ClusterResult = {
  fullName: string;
  threshold: number;
  embeddingModel: 'text-embedding-3-small';
  embeddedThisRun: number;
  alreadyEmbedded: number;
  skippedEmptyBody: number;
  commentsConsidered: number;
  clusterCount: number;
  // Pairwise cosine of the comments considered, so the threshold can be
  // compared with this run instead of with a number chosen in advance.
  similarity: SimilarityDistribution;
  clusters: ClusterSummary[];
};

export type PreparedClusters = {
  fullName: string;
  repoId: string;
  threshold: number;
  embeddedThisRun: number;
  alreadyEmbedded: number;
  skippedEmptyBody: number;
  commentsConsidered: number;
  similarity: SimilarityDistribution;
  clusters: CommentCluster[];
};

type PendingRow = {
  id: bigint;
  body: string;
  category: string | null;
  path: string | null;
};
type EmbeddedRow = {
  id: bigint;
  prNumber: number;
  path: string | null;
  embedding: string;
};

@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: OpenAiEmbedder,
  ) {}

  async cluster(
    owner: string,
    repoName: string,
    threshold = DEFAULT_CLUSTER_THRESHOLD,
  ): Promise<ClusterResult> {
    const prepared = await this.prepare(owner, repoName, threshold);
    return {
      fullName: prepared.fullName,
      threshold: prepared.threshold,
      embeddingModel: 'text-embedding-3-small',
      embeddedThisRun: prepared.embeddedThisRun,
      alreadyEmbedded: prepared.alreadyEmbedded,
      skippedEmptyBody: prepared.skippedEmptyBody,
      commentsConsidered: prepared.commentsConsidered,
      clusterCount: prepared.clusters.length,
      similarity: prepared.similarity,
      clusters: prepared.clusters.map((cluster) => ({
        size: cluster.size,
        prCount: cluster.prCount,
        commentIds: cluster.commentIds.map((id) => id.toString()),
      })),
    };
  }

  // Embed anything that still needs a vector, then cluster. Invariants
  // calls this too, so a draft run does not depend on a previous /cluster
  // call. A second call finds the vectors already stored and skips OpenAI.
  async prepare(
    owner: string,
    repoName: string,
    threshold = DEFAULT_CLUSTER_THRESHOLD,
  ): Promise<PreparedClusters> {
    const repo = await findRepoOrThrow(this.prisma, owner, repoName);
    const alreadyEmbedded = await this.countEmbedded(repo.id);
    const embedded = await this.embedMissing(repo.id);

    const rows = await this.prisma.$queryRaw<EmbeddedRow[]>`
      SELECT id, "prNumber", path, embedding::text AS embedding
      FROM "ReviewComment"
      WHERE "repoId" = ${repo.id}
        AND "inReplyToId" IS NULL
        AND bucket IS NOT NULL
        AND bucket <> 'noise'
        AND embedding IS NOT NULL
      ORDER BY id ASC
    `;

    const items: ClusterItem[] = [];
    for (const row of rows) {
      let vector: number[];
      try {
        vector = parseVectorLiteral(row.embedding);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Skipping comment ${row.id.toString()}: ${message}`);
        continue;
      }
      if (
        vector.length !== EMBEDDING_DIMENSIONS ||
        vector.some((value) => !Number.isFinite(value))
      ) {
        this.logger.warn(
          `Skipping comment ${row.id.toString()}: embedding width ${vector.length}`,
        );
        continue;
      }
      items.push({
        id: row.id,
        prNumber: row.prNumber,
        path: row.path,
        vector,
      });
    }

    const clusters = greedyClusters(items, threshold);
    const similarity = similarityDistribution(items);
    this.logger.log(
      `${repo.fullName}: embedded ${embedded.embeddedThisRun} this run, ${clusters.length} clusters at ${threshold}, max cosine ${similarity.max}`,
    );

    return {
      fullName: repo.fullName,
      repoId: repo.id,
      threshold,
      embeddedThisRun: embedded.embeddedThisRun,
      alreadyEmbedded,
      skippedEmptyBody: embedded.skippedEmptyBody,
      commentsConsidered: items.length,
      similarity,
      clusters,
    };
  }

  private async countEmbedded(repoId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "ReviewComment"
      WHERE "repoId" = ${repoId}
        AND "inReplyToId" IS NULL
        AND bucket IS NOT NULL
        AND bucket <> 'noise'
        AND embedding IS NOT NULL
    `;
    // COUNT comes back as a number or a bigint depending on the cast.
    // The JSON response needs a number either way.
    return Number(rows[0]?.count ?? 0);
  }

  private async embedMissing(repoId: string): Promise<{
    embeddedThisRun: number;
    skippedEmptyBody: number;
  }> {
    const pending = await this.prisma.$queryRaw<PendingRow[]>`
      SELECT id, body, category, path
      FROM "ReviewComment"
      WHERE "repoId" = ${repoId}
        AND "inReplyToId" IS NULL
        AND bucket IS NOT NULL
        AND bucket <> 'noise'
        AND embedding IS NULL
      ORDER BY id ASC
    `;

    const ready: Array<{ id: bigint; text: string }> = [];
    let skippedEmptyBody = 0;
    for (const row of pending) {
      const text = textToEmbed({
        body: row.body,
        category: row.category,
        path: row.path,
      });
      if (!text) {
        skippedEmptyBody += 1;
        continue;
      }
      ready.push({ id: row.id, text });
    }

    let embeddedThisRun = 0;
    for (let start = 0; start < ready.length; start += EMBED_BATCH) {
      const chunk = ready.slice(start, start + EMBED_BATCH);
      const vectors = await this.embedder.embedDocuments(
        chunk.map((row) => row.text),
      );
      if (vectors.length !== chunk.length) {
        throw new Error(
          `Embedding batch returned ${vectors.length} vectors for ${chunk.length} comments`,
        );
      }
      for (let index = 0; index < chunk.length; index++) {
        const literal = toVectorLiteral(vectors[index]);
        await this.prisma.$executeRaw`
          UPDATE "ReviewComment"
          SET embedding = ${literal}::vector
          WHERE id = ${chunk[index].id}
        `;
        embeddedThisRun += 1;
      }
    }

    return { embeddedThisRun, skippedEmptyBody };
  }
}
