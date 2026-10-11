import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ReposModule } from './repos/repos.module';

@Module({
  imports: [PrismaModule, ReposModule],
})
export class AppModule {}
