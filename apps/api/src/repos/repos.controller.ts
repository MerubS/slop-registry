import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { assertRepoName, parseLimit } from './repo-params';
import { SummaryService } from './summary.service';

@Controller('repos')
export class ReposController {
  constructor(
    private readonly ingestService: IngestService,
    private readonly summaryService: SummaryService,
  ) {}

  @Post(':owner/:repo/ingest')
  ingest(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('limit') limit?: string,
  ) {
    assertRepoName(owner, repo);
    return this.ingestService.ingest(owner, repo, parseLimit(limit));
  }

  @Get(':owner/:repo/summary')
  summary(@Param('owner') owner: string, @Param('repo') repo: string) {
    assertRepoName(owner, repo);
    return this.summaryService.summarize(owner, repo);
  }
}
