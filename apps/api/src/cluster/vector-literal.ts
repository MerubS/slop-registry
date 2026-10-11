// The ReviewComment.embedding column is vector(1536). Prisma cannot write
// an Unsupported field, so the cluster service sends this text and casts
// it in SQL: SET embedding = $1::vector. Only finite numbers are allowed,
// so a model glitch cannot change the SQL.
export const EMBEDDING_DIMENSIONS = 1536;

export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `text-embedding-3-small should return ${EMBEDDING_DIMENSIONS} numbers, got ${values.length}`,
    );
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('embedding contains a non-finite number');
    }
  }
  return `[${values.join(',')}]`;
}

export function parseVectorLiteral(text: string): number[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error('embedding text is not a pgvector literal');
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((part) => Number(part.trim()));
}
