// Prefix the category and the file path before the comment.
//
// The first aviator-co/av run embedded the body alone. Across 169 non-noise
// comments the maximum pairwise cosine was 0.772, under the old 0.82 gate,
// so same-rule comments never joined. Leading with the category and the
// path pulls comments that share a rule and a file area toward each other.
//
// The trade-off is the other error. Two different rules on the same file
// can land closer because they share the path line, and the same rule on
// files in different directories can land farther apart. The diff hunk and
// the thread replies are not in the vector. The path is still used later
// for the file glob, from the column, not by parsing this string back out.
export const EMBED_CHARS = 8000;

export function textToEmbed(input: {
  body: string;
  category: string | null;
  path: string | null;
}): string | null {
  const trimmed = input.body.trim();
  if (!trimmed) return null;
  const text = [
    `category: ${input.category ?? 'unknown'}`,
    `path: ${input.path ?? '(no file path)'}`,
    'comment:',
    trimmed,
  ].join('\n');
  if (text.length <= EMBED_CHARS) return text;
  return text.slice(0, EMBED_CHARS);
}
