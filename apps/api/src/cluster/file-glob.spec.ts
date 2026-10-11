import { suggestFileGlob } from './file-glob';

describe('suggestFileGlob', () => {
  it('uses the file itself when every comment is on that file', () => {
    expect(suggestFileGlob(['pkg/stack/stack.go', 'pkg/stack/stack.go'])).toBe(
      'pkg/stack/stack.go',
    );
  });

  it('globs a shared directory and a shared extension', () => {
    expect(suggestFileGlob(['pkg/stack/stack.go', 'pkg/stack/rebase.go'])).toBe(
      'pkg/stack/**/*.go',
    );
  });

  it('keeps the common parent when the files are in different folders', () => {
    expect(suggestFileGlob(['pkg/stack/stack.go', 'pkg/db/query.go'])).toBe(
      'pkg/**/*.go',
    );
  });

  it('globs only the extension when the top-level directories differ', () => {
    expect(suggestFileGlob(['pkg/a.go', 'web/b.go'])).toBe('**/*.go');
  });

  it('drops the extension when the files do not share one', () => {
    expect(suggestFileGlob(['src/a.go', 'src/b.ts'])).toBe('src/**/*');
  });

  it('returns ** when no comment has a path', () => {
    expect(suggestFileGlob([null, undefined, '  '])).toBe('**');
  });

  it('normalizes a leading dot-slash and backslashes', () => {
    expect(suggestFileGlob(['./pkg/a.go', 'pkg\\b.go'])).toBe('pkg/**/*.go');
  });
});
