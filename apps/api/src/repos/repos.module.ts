import { Module } from '@nestjs/common';
import { ClassifyService } from '../classify/classify.service';
import { OpenAiClassifier } from '../classify/openai-classifier';
import { ClusterService } from '../cluster/cluster.service';
import { OpenAiEmbedder } from '../cluster/openai-embedder';
import { GithubClient } from '../github/github.client';
import { InvariantsService } from '../invariants/invariants.service';
import { OpenAiDrafter } from '../invariants/openai-drafter';
import { PrismaModule } from '../prisma/prisma.module';
import { IngestService } from './ingest.service';
import { ReposController } from './repos.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReposController],
  providers: [
    IngestService,
    SummaryService,
    GithubClient,
    OpenAiClassifier,
    ClassifyService,
    OpenAiEmbedder,
    ClusterService,
    OpenAiDrafter,
    InvariantsService,
  ],
})
export class ReposModule {}
