import { EMBED_CHARS, HUNK_EMBED_CHARS, textToEmbed } from './text-to-embed';

describe('textToEmbed', () => {
  it('embeds the comment body and does not include the path or category', () => {
    const text = textToEmbed({
      body: 'Spell GitHub with a capital H',
      diffHunk: null,
    });
    expect(text).toBe('Spell GitHub with a capital H');
    expect(text).not.toContain('category:');
    expect(text).not.toContain('path:');
    expect(text).not.toContain('cmd/av');
  });

  it('appends changed diff lines and leaves the hunk header out', () => {
    const body = 'Do not leave debug prints in the committed source.';
    const text = textToEmbed({
      body,
      diffHunk: [
        '@@ -1,3 +1,3 @@',
        ' package main',
        '-fmt.Println("debug")',
        '+return nil',
        '+++ b/cmd/av/main.go',
      ].join('\n'),
    });
    expect(text?.startsWith(body)).toBe(true);
    expect(text).toContain('diff excerpt:');
    expect(text).toContain('-fmt.Println("debug")');
    expect(text).toContain('+return nil');
    expect(text).not.toContain('@@');
    expect(text).not.toContain('+++');
    expect(text).not.toContain('category:');
    expect(text).not.toContain('path:');
  });

  it('does not let the diff excerpt run longer than the comment', () => {
    const body = 'Short rule.';
    const text = textToEmbed({
      body,
      diffHunk: `-${'x'.repeat(200)}\n+${'y'.repeat(200)}`,
    });
    const excerpt = text?.split('diff excerpt:\n')[1] ?? '';
    expect(excerpt.length).toBeLessThanOrEqual(body.length);
    expect(excerpt.length).toBeLessThanOrEqual(HUNK_EMBED_CHARS);
  });

  it('omits a hunk that has no added or removed lines', () => {
    expect(
      textToEmbed({
        body: 'Spell GitHub with a capital H',
        diffHunk: '@@ -1 +1 @@\n context only',
      }),
    ).toBe('Spell GitHub with a capital H');
  });

  it('returns null for an empty body even when a hunk is present', () => {
    expect(
      textToEmbed({
        body: '   ',
        diffHunk: '-fmt.Println("debug")',
      }),
    ).toBeNull();
  });

  it('truncates the whole text at EMBED_CHARS', () => {
    const text = textToEmbed({
      body: 'x'.repeat(EMBED_CHARS + 50),
      diffHunk: null,
    });
    expect(text).toHaveLength(EMBED_CHARS);
  });
});
