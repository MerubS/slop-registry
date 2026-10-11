import { BadRequestException } from '@nestjs/common';
import {
  assertRepoName,
  parseIncludeBots,
  parseLimit,
  parseThreshold,
} from './repo-params';

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

describe('parseIncludeBots', () => {
  it('defaults to human comments only', () => {
    expect(parseIncludeBots(undefined)).toBe(false);
    expect(parseIncludeBots('')).toBe(false);
    expect(parseIncludeBots('false')).toBe(false);
    expect(parseIncludeBots('true')).toBe(true);
    expect(parseIncludeBots('1')).toBe(true);
  });
});

describe('parseThreshold', () => {
  it('defaults to 0.82 and accepts a number from 0 to 1', () => {
    expect(parseThreshold(undefined)).toBe(0.82);
    expect(parseThreshold('0.82')).toBe(0.82);
    expect(parseThreshold('0')).toBe(0);
    expect(parseThreshold('1')).toBe(1);
    expect(() => parseThreshold('1.1')).toThrow(BadRequestException);
    expect(() => parseThreshold('high')).toThrow(BadRequestException);
  });
});
