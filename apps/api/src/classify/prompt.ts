// The bucket definitions live in the prompt, not only in a comment next to
// the code. The model only sees this string. Temperature is 0, so the same
// comment and the same prompt should come back with the same label.
export const CLASSIFY_SYSTEM_PROMPT = `You sort one pull-request review comment into a bucket and a category.

Buckets:
- deterministic: a static rule, an AST check, or a linter could catch this without running the code.
- execution_testable: running the code or a test could catch this. Behavior, a bug, a missing test, or a failure that shows up when the program runs.
- judgment: a design, intent, or trade-off opinion. Reasonable people could disagree, and no rule or test fully settles it.
- noise: no rule in it. LGTM, thanks, a typo-only nit, or a question that does not state a rule.

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

export function commentPrompt(input: {
  path: string | null;
  body: string;
}): string {
  const truncated = input.body.length > COMMENT_PROMPT_CHARS;
  const body = truncated
    ? input.body.slice(0, COMMENT_PROMPT_CHARS)
    : input.body;
  const note = truncated
    ? `\n(The stored comment is longer. This prompt kept the first ${COMMENT_PROMPT_CHARS} characters.)`
    : '';
  return `path: ${input.path ?? '(no file path)'}\ncomment:\n${body}${note}`;
}
