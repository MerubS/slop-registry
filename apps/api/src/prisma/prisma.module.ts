import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Imported by ReposModule. Not global, so a new module has to opt in.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
