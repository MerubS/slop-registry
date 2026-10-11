import { BadRequestException } from '@nestjs/common';
import { DEFAULT_CLUSTER_THRESHOLD } from '../cluster/complete-linkage';

// GitHub owner and repo names are letters, numbers, dots, underscores, hyphens.
// Rejecting anything else keeps a bad param out of the URL we send GitHub.
const NAME = /^[A-Za-z0-9._-]+$/;

export function assertRepoName(owner: string, repo: string): void {
  if (!NAME.test(owner) || !NAME.test(repo)) {
    throw new BadRequestException(
      'owner and repo must be GitHub names: letters, numbers, dot, underscore, hyphen',
    );
  }
}

// Default 500 matches the day-1 check. Cap at 2000 so a huge limit cannot
// walk dozens of pages on the 60-request anonymous budget.
export function parseLimit(raw: string | string[] | undefined): number {
  if (Array.isArray(raw)) {
    throw new BadRequestException('limit must be a single integer');
  }
  if (raw === undefined || raw === '') return 500;
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException('limit must be a positive integer');
  }
  const limit = Number(raw);
  if (limit < 1 || limit > 2000) {
    throw new BadRequestException('limit must be between 1 and 2000');
  }
  return limit;
}

export function parseIncludeBots(raw: string | string[] | undefined): boolean {
  if (Array.isArray(raw)) {
    throw new BadRequestException('includeBots must be true or false');
  }
  if (raw === undefined || raw === '' || raw === 'false' || raw === '0') {
    return false;
  }
  if (raw === 'true' || raw === '1') return true;
  throw new BadRequestException('includeBots must be true or false');
}

export function parseThreshold(raw: string | string[] | undefined): number {
  if (Array.isArray(raw)) {
    throw new BadRequestException(
      'threshold must be a single number from 0 to 1',
    );
  }
  if (raw === undefined || raw === '') return DEFAULT_CLUSTER_THRESHOLD;
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new BadRequestException('threshold must be a number from 0 to 1');
  }
  const threshold = Number(raw);
  if (threshold < 0 || threshold > 1) {
    throw new BadRequestException('threshold must be a number from 0 to 1');
  }
  return threshold;
}
