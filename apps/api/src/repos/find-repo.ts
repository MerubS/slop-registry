import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Shared by classify, cluster, summary, and invariants so a missing repo
// is the same 404 everywhere. "Never ingested" has to stay distinct from
// "ingested, and the count is zero."
export async function findRepoOrThrow(
  prisma: PrismaService,
  owner: string,
  repoName: string,
): Promise<{ id: string; fullName: string }> {
  const fullName = `${owner}/${repoName}`;
  const repo = await prisma.repo.findUnique({ where: { fullName } });
  if (!repo) {
    throw new NotFoundException(
      `No ingest stored for ${fullName}. POST /repos/${owner}/${repoName}/ingest first.`,
    );
  }
  return repo;
}
