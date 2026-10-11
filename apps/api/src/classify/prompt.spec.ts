import {
  CLASSIFY_SYSTEM_PROMPT,
  MAX_REPLIES_IN_PROMPT,
  commentPrompt,
} from './prompt';

describe('classification prompt', () => {
  it('defines every bucket in the text the model sees', () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'deterministic: a static rule, an AST check, or a linter',
    );
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'execution_testable: running the code or a test',
    );
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'judgment: a design, intent, or trade-off opinion',
    );
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'noise: only "LGTM", thanks, an acknowledgement, or a pure typo fix.',
    );
  });

  it('tells the model a concrete suggestion is the rule it implies', () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'A concrete code change is not noise.',
    );
    expect(CLASSIFY_SYSTEM_PROMPT).toContain('suggestion block');
    expect(CLASSIFY_SYSTEM_PROMPT).toContain(
      'A suggestion that only fixes a typo is still noise.',
    );
  });

  it('names every Verify category', () => {
    for (const category of [
      'functional_correctness',
      'test_coverage',
      'security',
      'performance',
      'accessibility',
      'observability',
      'backwards_compatibility',
      'documentation',
      'code_style',
    ]) {
      expect(CLASSIFY_SYSTEM_PROMPT).toContain(category);
    }
  });

  it('passes the diff hunk and thread replies as context', () => {
    const prompt = commentPrompt({
      path: 'pkg/stack/stack.go',
      body: '```suggestion\nClose()\n```',
      diffHunk: '@@ -1 +1 @@\n-f.Close()\n+Close()',
      replies: [{ author: 'jainankit', body: 'Close() checks nil itself now' }],
    });

    expect(prompt).toContain('pkg/stack/stack.go');
    expect(prompt).toContain('```suggestion');
    expect(prompt).toContain('f.Close()');
    expect(prompt).toContain('Close() checks nil itself now');
    expect(prompt).toContain('do not classify these as the review');
  });

  it('keeps at most eight replies and says the rest were left out', () => {
    const replies = Array.from(
      { length: MAX_REPLIES_IN_PROMPT + 2 },
      (_, i) => ({
        author: `author-${i}`,
        body: `reply ${i}`,
      }),
    );
    const prompt = commentPrompt({
      path: null,
      body: 'check this',
      diffHunk: null,
      replies,
    });

    expect(prompt).toContain('(no diff hunk)');
    expect(prompt).toContain('8. author-7: reply 7');
    expect(prompt).not.toContain('author-8');
    expect(prompt).toContain('2 more replies are stored');
  });
});
