import { z } from 'zod';
import { CATEGORIES, Category } from '../classify/labels';

export const DRAFT_SYSTEM_PROMPT = `You check whether pull-request review comments state one specific, checkable team rule. If they do, write that rule. If they do not, say so by returning no supporting comments.

A specific rule names the thing a reviewer can check.
- "Spell GitHub with a capital H" is specific.
- "Use pull request, not PR, in user-facing text" is specific.
- "The man page synopsis must list the command's real flags" is specific.
- "Use Args: cobra.NoArgs" is specific.
- "Do not leave debug statements in" is specific.
- "Error messages must be clear" is a theme. Do not write a theme.

supportingCommentIds lists only the comments that state that same rule. Return an empty list when the comments do not share one specific rule. Do not include a comment because it sits in the same directory.

The assertion is one sentence. It must be checkable from the supporting comments only. Do not widen it to cover comments you left out. Do not turn it into an implementation plan such as "add a helper in util.go". Naming the spelling, the flag, or the API is the rule, not an implementation.`;

export type VerifiedDraft = {
  supportingCommentIds: string[];
  title: string;
  assertion: string;
  category: Category;
};

const LooseVerified = z.object({
  supportingCommentIds: z.array(z.union([z.string(), z.number()])),
  title: z.string(),
  assertion: z.string(),
  category: z.enum(CATEGORIES),
});

// Empty title and assertion are allowed. The service discards a cluster
// that does not name a rule. A long sentence is cut so one reply cannot
// fail the run after other clusters already verified.
export function parseVerifiedDraft(input: unknown): VerifiedDraft {
  const loose = LooseVerified.parse(input);
  const supportingCommentIds = [
    ...new Set(
      loose.supportingCommentIds
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0),
    ),
  ];
  return {
    supportingCommentIds,
    title: loose.title.trim().replace(/\s+/g, ' ').slice(0, 120),
    assertion: loose.assertion.trim().replace(/\s+/g, ' ').slice(0, 400),
    category: loose.category,
  };
}

export function draftPrompt(input: {
  comments: Array<{
    id: string;
    prNumber: number;
    path: string | null;
    body: string;
  }>;
}): string {
  const examples = input.comments
    .map((comment, index) => {
      const body = comment.body.trim().replace(/\s+/g, ' ').slice(0, 400);
      const path = comment.path ?? '(no path)';
      return `${index + 1}. id ${comment.id}, PR #${comment.prNumber}, path ${path}: ${body}`;
    })
    .join('\n');

  return `These review comments were grouped because their wording is similar. Decide whether they state one specific rule.

Return:
- supportingCommentIds: the id values, copied from the list below, of the comments that state that one rule. Use an empty list when they do not.
- title: a short subject, 120 characters or fewer. Empty when there is no rule.
- assertion: one checkable sentence. Empty when there is no rule.
- category: one of ${CATEGORIES.join(', ')}.

The path is context. It is not evidence that the comments share a rule.

${examples}`;
}
