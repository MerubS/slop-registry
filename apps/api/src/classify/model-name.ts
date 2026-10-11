// One env var for both classification and invariant drafts. The embedding
// model is separate and fixed: text-embedding-3-small, 1536 dimensions,
// which is the width of the column created on day 1.
export function openAiModelName(): string {
  const raw = process.env.OPENAI_MODEL?.trim();
  return raw || 'gpt-4o-mini';
}
