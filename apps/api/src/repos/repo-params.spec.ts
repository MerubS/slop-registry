import { BadRequestException } from '@nestjs/common';
import { assertRepoName, parseLimit } from './repo-params';

describe('parseLimit', () => {
  it('defaults to 500', () => {
    expect(parseLimit(undefined)).toBe(500);
    expect(parseLimit('')).toBe(500);
  });

  it('accepts a limit inside 1..2000', () => {
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('500')).toBe(500);
    expect(parseLimit('2000')).toBe(2000);
  });

  it('rejects junk, zero, and huge limits', () => {
    expect(() => parseLimit('0')).toThrow(BadRequestException);
    expect(() => parseLimit('2001')).toThrow(BadRequestException);
    expect(() => parseLimit('abc')).toThrow(BadRequestException);
    expect(() => parseLimit(['1', '2'])).toThrow(BadRequestException);
  });
});

describe('assertRepoName', () => {
  it('accepts normal GitHub names', () => {
    expect(() => assertRepoName('aviator-co', 'av')).not.toThrow();
    expect(() => assertRepoName('foo.js', 'bar_baz')).not.toThrow();
  });

  it('rejects slashes and spaces', () => {
    expect(() => assertRepoName('a/b', 'c')).toThrow(BadRequestException);
    expect(() => assertRepoName('a', 'c d')).toThrow(BadRequestException);
  });
});
