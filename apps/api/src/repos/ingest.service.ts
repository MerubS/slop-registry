import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GithubClient, GithubRequestError } from '../github/github.client';
import { CommentWrite } from '../github/github-comment';
import { toCommentWrite } from '../github/to-comment-write';
import { PrismaService } from '../prisma/prisma.service';

const UPSERT_CHUNK = 50;

export type IngestResult = {
  fullName: string;
  requested: number;
  received: number;
  totalStored: number;
};

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubClient,
  ) {}

  async ingest(
    owner: string,
    repoName: string,
    limit: number,
  ): Promise<IngestResult> {
    const fullName = `${owner}/${repoName}`;

    let raw;
    try {
      raw = await this.github.fetchReviewComments(owner, repoName, limit);
    } catch (error) {
      if (error instanceof GithubRequestError) {
        throw mapGithubError(error, fullName);
      }
      throw error;
    }

    const repo = await this.prisma.repo.upsert({
      where: { fullName },
      create: { fullName, fetchedAt: new Date() },
      update: { fetchedAt: new Date() },
    });

    const writes = raw.map((comment) => toCommentWrite(repo.id, comment));
    await this.saveComments(writes);

    const totalStored = await this.prisma.reviewComment.count({
      where: { repoId: repo.id },
    });

    this.logger.log(
      `${fullName}: received ${writes.length}, stored ${totalStored}`,
    );

    return {
      fullName,
      requested: limit,
      received: writes.length,
      totalStored,
    };
  }

  // One transaction per 50 rows, instead of one transaction for the whole
  // pull. A failed chunk is safe to retry: the primary key is the GitHub
  // comment id, so a second upsert updates the same row.
  private async saveComments(writes: CommentWrite[]) {
    for (let i = 0; i < writes.length; i += UPSERT_CHUNK) {
      const chunk = writes.slice(i, i + UPSERT_CHUNK);
      await this.prisma.$transaction(
        chunk.map((row) =>
          this.prisma.reviewComment.upsert({
            where: { id: row.id },
            // select id only so Prisma does not try to read the vector column
            select: { id: true },
            create: {
              id: row.id,
              repoId: row.repoId,
              prNumber: row.prNumber,
              author: row.author,
              isBot: row.isBot,
              path: row.path,
              body: row.body,
              htmlUrl: row.htmlUrl,
              createdAt: row.createdAt,
              inReplyToId: row.inReplyToId,
              diffHunk: row.diffHunk,
            },
            // bucket, category, reason, and embedding are left out on
            // purpose. A later classifier will fill them, and a re-ingest
            // must not wipe that work when the comment body is refreshed.
            // inReplyToId and diffHunk are refreshed: they come from GitHub,
            // and a row ingested before the thread columns existed needs them.
            update: {
              repoId: row.repoId,
              prNumber: row.prNumber,
              author: row.author,
              isBot: row.isBot,
              path: row.path,
              body: row.body,
              htmlUrl: row.htmlUrl,
              createdAt: row.createdAt,
              inReplyToId: row.inReplyToId,
              diffHunk: row.diffHunk,
            },
          }),
        ),
      );
    }
  }
}

function mapGithubError(error: GithubRequestError, fullName: string) {
  if (error.status === 404) {
    return new NotFoundException(
      `GitHub returned 404 for ${fullName}. The repo is missing, private, or not spelled as owner/repo.`,
    );
  }
  if (error.status === 401) {
    return new BadGatewayException(
      'GitHub rejected GITHUB_TOKEN (401). Fix the token, or unset it to call GitHub without authentication.',
    );
  }
  return new BadGatewayException(error.message);
}
