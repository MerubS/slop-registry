import { DRAFT_SYSTEM_PROMPT, draftPrompt, parseVerifiedDraft } from './draft';

describe('verified draft parsing', () => {
  it('accepts string ids and drops blanks', () => {
    const parsed = parseVerifiedDraft({
      supportingCommentIds: ['11', ' 22 ', '', 33],
      title: '  Spell GitHub  ',
      assertion: 'Spell GitHub with a capital H.',
      category: 'documentation',
    });
    expect(parsed.supportingCommentIds).toEqual(['11', '22', '33']);
    expect(parsed.title).toBe('Spell GitHub');
  });

  it('tells the model to prefer a checkable rule over a theme', () => {
    expect(DRAFT_SYSTEM_PROMPT).toContain('Spell GitHub with a capital H');
    expect(DRAFT_SYSTEM_PROMPT).toContain('cobra.NoArgs');
    expect(DRAFT_SYSTEM_PROMPT).toContain(
      '"Error messages must be clear" is a theme.',
    );
    expect(DRAFT_SYSTEM_PROMPT).toContain('same directory');
  });

  it('shows each comment id and does not treat the path as the rule', () => {
    const prompt = draftPrompt({
      comments: [
        {
          id: '11',
          prNumber: 4,
          path: 'docs/github.md',
          body: 'Spell GitHub, never Github',
        },
        {
          id: '22',
          prNumber: 9,
          path: 'cmd/av/main.go',
          body: 'error messages must be clear',
        },
      ],
    });
    expect(prompt).toContain('id 11');
    expect(prompt).toContain('id 22');
    expect(prompt).toContain('The path is context');
    expect(prompt).not.toContain('The file glob is already chosen');
  });
});
