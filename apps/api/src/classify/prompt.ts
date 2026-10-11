// The bucket definitions live in the prompt, not only in a comment next to
// the code. The model only sees this string. Temperature is 0, so the same
// comment and the same prompt should come back with the same label.
//
// The first aviator-co/av run treated suggestion blocks as noise (22 of 30
// human ones) and labeled thread replies as if they were the review. Noise
// is now only the comments that carry no rule, and the prompt says the
// thing to label is the top-level comment.
export const CLASSIFY_SYSTEM_PROMPT = `You sort one pull-request review comment into a bucket and a category.

Label the top-level review comment only. The diff hunk is the code that comment sits on. Thread replies are context: they show what people said afterwards. Do not label a reply as if it were the review. A reply that says the note was already handled does not make the review comment noise.

Buckets:
- deterministic: a static rule, an AST check, or a linter could catch this without running the code.
- execution_testable: running the code or a test could catch this. Behavior, a bug, a missing test, or a failure that shows up when the program runs.
- judgment: a design, intent, or trade-off opinion. Reasonable people could disagree, and no rule or test fully settles it.
- noise: only "LGTM", thanks, an acknowledgement, or a pure typo fix.

A concrete code change is not noise. A suggestion block, a rewritten line, or "use X instead of Y" is the rule that change implies. Classify that rule as deterministic when a linter or an AST could enforce it without running the code, execution_testable when you would have to run the code or a test to know it is right, and judgment when it is a design preference. A suggestion that only fixes a typo is still noise.

Categories, pick the closest one even when the bucket is noise:
- functional_correctness: the change behaves correctly for expected and edge-case inputs.
- test_coverage: new and changed code is covered by meaningful tests.
- security: the change avoids common vulnerabilities and enforces required controls.
- performance: the change does not introduce avoidable latency, memory, or query regressions.
- accessibility: UI changes meet accessibility standards.
- observability: errors emit metrics, and logging uses structured fields.
- backwards_compatibility: public surfaces do not break existing consumers.
- documentation: public APIs and behavior changes are documented.
- code_style: the code follows team conventions such as types, naming, and layering.

The reason is 20 words or fewer and says why this bucket fits. Do not repeat the comment.`;

// Long review comments are often a pasted log. The row in Postgres keeps the
// full body. The model only needs the part a person would read first.
export const COMMENT_PROMPT_CHARS = 4000;
export const HUNK_PROMPT_CHARS = 2000;
export const REPLY_PROMPT_CHARS = 500;
export const MAX_REPLIES_IN_PROMPT = 8;

export type PromptReply = {
  author: string;
  body: string;
};

export function commentPrompt(input: {
  path: string | null;
  body: string;
  diffHunk: string | null;
  replies: PromptReply[];
}): string {
  const lines = [
    `path: ${input.path ?? '(no file path)'}`,
    '',
    'diff hunk (the code this comment is attached to):',
    clip(
      input.diffHunk?.trim() ? input.diffHunk : '(no diff hunk)',
      HUNK_PROMPT_CHARS,
      'diff hunk',
    ),
    '',
    'comment to classify:',
    clip(input.body, COMMENT_PROMPT_CHARS, 'comment'),
    '',
    'thread replies (context only, do not classify these as the review):',
  ];

  const shown = input.replies.slice(0, MAX_REPLIES_IN_PROMPT);
  if (shown.length === 0) {
    lines.push('(no replies)');
  } else {
    shown.forEach((reply, index) => {
      lines.push(
        `${index + 1}. ${reply.author}: ${clip(reply.body, REPLY_PROMPT_CHARS, 'reply')}`,
      );
    });
    const omitted = input.replies.length - shown.length;
    if (omitted > 0) {
      lines.push(
        `(${omitted} more replies are stored and were left out of this prompt.)`,
      );
    }
  }

  return lines.join('\n');
}

function clip(text: string, max: number, label: string): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n(The ${label} is longer. This prompt kept the first ${max} characters.)`;
}
