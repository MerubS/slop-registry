import { Module } from '@nestjs/common';
import { GithubClient } from '../github/github.client';
import { PrismaModule } from '../prisma/prisma.module';
import { IngestService } from './ingest.service';
import { ReposController } from './repos.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReposController],
  providers: [IngestService, SummaryService, GithubClient],
})
export class ReposModule {}
