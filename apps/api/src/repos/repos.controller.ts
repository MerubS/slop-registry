import { Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ClassifyService } from '../classify/classify.service';
import { ClusterService } from '../cluster/cluster.service';
import {
  renderInvariantsMarkdown,
  renderInvariantsYaml,
} from '../invariants/export-invariants';
import { InvariantsService } from '../invariants/invariants.service';
import { IngestService } from './ingest.service';
import {
  assertRepoName,
  parseIncludeBots,
  parseLimit,
  parseThreshold,
} from './repo-params';
import { SummaryService } from './summary.service';

@Controller('repos')
export class ReposController {
  constructor(
    private readonly ingestService: IngestService,
    private readonly summaryService: SummaryService,
    private readonly classifyService: ClassifyService,
    private readonly clusterService: ClusterService,
    private readonly invariantsService: InvariantsService,
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

  @Post(':owner/:repo/classify')
  classify(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('includeBots') includeBots?: string,
  ) {
    assertRepoName(owner, repo);
    return this.classifyService.classify(
      owner,
      repo,
      parseIncludeBots(includeBots),
    );
  }

  @Post(':owner/:repo/cluster')
  cluster(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('threshold') threshold?: string,
  ) {
    assertRepoName(owner, repo);
    return this.clusterService.cluster(owner, repo, parseThreshold(threshold));
  }

  @Post(':owner/:repo/invariants')
  invariants(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('threshold') threshold?: string,
  ) {
    assertRepoName(owner, repo);
    return this.invariantsService.draft(owner, repo, parseThreshold(threshold));
  }

  @Get(':owner/:repo/summary')
  summary(@Param('owner') owner: string, @Param('repo') repo: string) {
    assertRepoName(owner, repo);
    return this.summaryService.summarize(owner, repo);
  }

  @Get(':owner/:repo/classifications')
  classifications(@Param('owner') owner: string, @Param('repo') repo: string) {
    assertRepoName(owner, repo);
    return this.classifyService.list(owner, repo);
  }

  @Get(':owner/:repo/invariants.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  async invariantsYaml(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    assertRepoName(owner, repo);
    const listed = await this.invariantsService.list(owner, repo);
    return renderInvariantsYaml(listed.fullName, listed.invariants);
  }

  @Get(':owner/:repo/invariants.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async invariantsMarkdown(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    assertRepoName(owner, repo);
    const listed = await this.invariantsService.list(owner, repo);
    return renderInvariantsMarkdown(listed.fullName, listed.invariants);
  }
}
