import { EMBED_CHARS, textToEmbed } from './text-to-embed';

describe('textToEmbed', () => {
  it('prefixes the category and the file path', () => {
    expect(
      textToEmbed({
        body: 'nil-check the closer',
        category: 'functional_correctness',
        path: 'pkg/stack/stack.go',
      }),
    ).toBe(
      'category: functional_correctness\npath: pkg/stack/stack.go\ncomment:\nnil-check the closer',
    );
  });

  it('uses placeholders when the category or path is missing', () => {
    expect(
      textToEmbed({ body: 'add a test', category: null, path: null }),
    ).toBe('category: unknown\npath: (no file path)\ncomment:\nadd a test');
  });

  it('returns null for an empty body', () => {
    expect(
      textToEmbed({ body: '   ', category: 'code_style', path: 'a.go' }),
    ).toBeNull();
  });

  it('truncates the prefixed text at EMBED_CHARS', () => {
    const text = textToEmbed({
      body: 'x'.repeat(EMBED_CHARS),
      category: 'code_style',
      path: 'a.go',
    });
    expect(text).toHaveLength(EMBED_CHARS);
    expect(text?.startsWith('category: code_style\n')).toBe(true);
  });
});
