// Embed the reviewer's words, not the path. The path is used later for the
// file glob. Putting the path in the vector would push two copies of the
// same rule apart just because they were left on different files.
export const EMBED_CHARS = 8000;

export function textToEmbed(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  if (trimmed.length <= EMBED_CHARS) return trimmed;
  return trimmed.slice(0, EMBED_CHARS);
}
