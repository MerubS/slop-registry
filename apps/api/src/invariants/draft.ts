import { z } from 'zod';
import { CATEGORIES, Category } from '../classify/labels';

export const InvariantDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  assertion: z.string().trim().min(1).max(400),
  category: z.enum(CATEGORIES),
});

export type InvariantDraft = {
  title: string;
  assertion: string;
  category: Category;
};

const LooseDraft = z.object({
  title: z.string(),
  assertion: z.string(),
  category: z.enum(CATEGORIES),
});

// The model is asked for one sentence. We still collapse whitespace and
// cap the length so a long reply cannot fail the whole draft step after
// nine successful calls.
export function parseDraft(input: unknown): InvariantDraft {
  const loose = LooseDraft.parse(input);
  const title = loose.title.trim().replace(/\s+/g, ' ').slice(0, 120);
  const assertion = loose.assertion.trim().replace(/\s+/g, ' ').slice(0, 400);
  return InvariantDraftSchema.parse({
    title,
    assertion,
    category: loose.category,
  });
}

export function draftPrompt(input: {
  fileGlob: string;
  clusterSize: number;
  comments: Array<{ prNumber: number; path: string | null; body: string }>;
}): string {
  const shown = input.comments.slice(0, 8);
  const examples = shown
    .map((comment, index) => {
      const body = comment.body.trim().replace(/\s+/g, ' ').slice(0, 500);
      return `${index + 1}. PR #${comment.prNumber}, path ${comment.path ?? '(none)'}: ${body}`;
    })
    .join('\n');

  return `Write one draft invariant from this cluster of review comments.

An invariant is a team rule. Follow these constraints:
- title: a short subject, 120 characters or fewer.
- assertion: ONE sentence that states the rule. Do not name the function, file, or library that would implement it. "All migrations must declare a down block" is a rule. "Call Down() in src/migrate/migrate.go" is an implementation.
- category: one of ${CATEGORIES.join(', ')}.

The file glob is already chosen from the comment paths: ${input.fileGlob}. Do not put a different path in the assertion.

The cluster has ${input.clusterSize} comments from at least two pull requests. ${shown.length} of them are below.

${examples}`;
}
