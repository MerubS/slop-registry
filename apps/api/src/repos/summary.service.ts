import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
};

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(owner: string, repoName: string): Promise<RepoSummary> {
    const fullName = `${owner}/${repoName}`;
    const repo = await this.prisma.repo.findUnique({ where: { fullName } });
    if (!repo) {
      throw new NotFoundException(
        `No ingest stored for ${fullName}. POST /repos/${owner}/${repoName}/ingest first.`,
      );
    }

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

    return {
      fullName,
      total,
      human,
      bot,
      botShare: total === 0 ? 0 : Math.round((bot / total) * 10000) / 10000,
      topBotLogins: topN(bots),
      topHumanAuthors: topN(humans),
    };
  }
}

function topN(rows: AuthorCount[]): AuthorCount[] {
  return [...rows]
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login))
    .slice(0, TOP_N);
}
