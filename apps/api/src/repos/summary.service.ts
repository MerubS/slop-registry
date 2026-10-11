import { Injectable } from '@nestjs/common';
import {
  InvariantView,
  loadInvariantViews,
} from '../invariants/load-invariants';
import { PrismaService } from '../prisma/prisma.service';
import { BucketCounts, bucketCountsFromGroups } from './bucket-counts';
import { findRepoOrThrow } from './find-repo';

// Enough to see who dominates the window. The page does not need every login.
const TOP_N = 10;

export type AuthorCount = {
  login: string;
  count: number;
};

export type RepoSummary = {
  fullName: string;
  total: number;
  human: number;
  bot: number;
  // Fraction from 0 to 1, rounded to 4 decimal places. 0.25 means 25%.
  botShare: number;
  topBotLogins: AuthorCount[];
  topHumanAuthors: AuthorCount[];
  // human ignores bots. all includes them. unlabeled means bucket is still null.
  buckets: {
    human: BucketCounts;
    all: BucketCounts;
  };
  invariants: InvariantView[];
};

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(owner: string, repoName: string): Promise<RepoSummary> {
    const repo = await findRepoOrThrow(this.prisma, owner, repoName);
    const fullName = repo.fullName;

    const groups = await this.prisma.reviewComment.groupBy({
      by: ['isBot', 'author'],
      where: { repoId: repo.id },
      _count: { _all: true },
    });

    let human = 0;
    let bot = 0;
    const humans: AuthorCount[] = [];
    const bots: AuthorCount[] = [];

    for (const group of groups) {
      const count = group._count._all;
      if (group.isBot) {
        bot += count;
        bots.push({ login: group.author, count });
      } else {
        human += count;
        humans.push({ login: group.author, count });
      }
    }

    const total = human + bot;
    const bucketGroups = await this.prisma.reviewComment.groupBy({
      by: ['isBot', 'bucket'],
      where: { repoId: repo.id },
      _count: { _all: true },
    });

    return {
      fullName,
      total,
      human,
      bot,
      botShare: total === 0 ? 0 : Math.round((bot / total) * 10000) / 10000,
      topBotLogins: topN(bots),
      topHumanAuthors: topN(humans),
      buckets: bucketCountsFromGroups(
        bucketGroups.map((group) => ({
          isBot: group.isBot,
          bucket: group.bucket,
          count: group._count._all,
        })),
      ),
      invariants: await loadInvariantViews(this.prisma, repo.id),
    };
  }
}

function topN(rows: AuthorCount[]): AuthorCount[] {
  return [...rows]
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login))
    .slice(0, TOP_N);
}
