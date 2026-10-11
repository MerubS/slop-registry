import { ZodError } from 'zod';
import { ClassificationSchema, parseClassification, wordCount } from './labels';

const valid = {
  bucket: 'deterministic',
  category: 'code_style',
  reason: 'A linter can forbid this pattern.',
};

describe('ClassificationSchema', () => {
  it('accepts a label with a short reason', () => {
    expect(ClassificationSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a reason of exactly 20 words', () => {
    const reason = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    expect(wordCount(reason)).toBe(20);
    expect(ClassificationSchema.parse({ ...valid, reason }).reason).toBe(
      reason,
    );
  });

  it('rejects an unknown bucket', () => {
    expect(() =>
      ClassificationSchema.parse({ ...valid, bucket: 'maybe' }),
    ).toThrow(ZodError);
  });

  it('rejects an unknown category', () => {
    expect(() =>
      ClassificationSchema.parse({ ...valid, category: 'style' }),
    ).toThrow(ZodError);
  });

  it('rejects a reason longer than 20 words', () => {
    const reason = Array.from({ length: 21 }, (_, i) => `word${i}`).join(' ');
    expect(() => ClassificationSchema.parse({ ...valid, reason })).toThrow(
      /20 words or fewer/,
    );
  });

  it('rejects an empty reason', () => {
    expect(() =>
      ClassificationSchema.parse({ ...valid, reason: '   ' }),
    ).toThrow(ZodError);
  });
});

describe('parseClassification', () => {
  it('clamps a long reason so the stored label still matches the schema', () => {
    const words = Array.from({ length: 21 }, (_, i) => `word${i}`);
    const label = parseClassification({ ...valid, reason: words.join(' ') });
    expect(label.reason).toBe(words.slice(0, 20).join(' '));
    expect(wordCount(label.reason)).toBe(20);
    expect(ClassificationSchema.parse(label)).toEqual(label);
  });

  it('still rejects a bucket the enum does not name', () => {
    expect(() => parseClassification({ ...valid, bucket: 'nit' })).toThrow(
      ZodError,
    );
  });
});
