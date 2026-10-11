import { CLASSIFY_SYSTEM_PROMPT } from './prompt';

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
      'noise: no rule in it. LGTM, thanks, a typo-only nit',
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
});
