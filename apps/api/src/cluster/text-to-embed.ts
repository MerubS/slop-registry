// Embed the comment, not the path and not the category.
//
// Run 2 prefixed every vector with `category:` and `path:`. Short comments
// were dominated by that prefix, so clusters formed by directory (cmd/av,
// docs, internal/git) instead of by the rule in the words. The path stays
// on the row and is used only when suggestFileGlob runs, after verification
// has dropped comments that do not state the rule.
//
// A short excerpt of the changed diff lines can sit after the body. It is
// capped so it is never longer than the comment. A hunk longer than the
// comment would do what the path prefix did. Lines that are only a hunk
// header are left out. An empty comment is not embedded.
export const EMBED_CHARS = 8000;
export const HUNK_EMBED_CHARS = 160;

export function textToEmbed(input: {
  body: string;
  diffHunk: string | null;
}): string | null {
  const body = input.body.trim();
  if (!body) return null;

  const excerpt = hunkExcerpt(input.diffHunk, body.length);
  const text = excerpt ? `${body}\n\ndiff excerpt:\n${excerpt}` : body;
  if (text.length <= EMBED_CHARS) return text;
  return text.slice(0, EMBED_CHARS);
}

function hunkExcerpt(hunk: string | null, bodyLength: number): string | null {
  if (!hunk?.trim() || bodyLength <= 0) return null;
  const changed = hunk
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        /^[+-]/.test(line) &&
        !line.startsWith('+++') &&
        !line.startsWith('---'),
    )
    .join('\n')
    .trim();
  if (!changed) return null;
  const cap = Math.min(HUNK_EMBED_CHARS, bodyLength);
  if (changed.length <= cap) return changed;
  return changed.slice(0, cap);
}
