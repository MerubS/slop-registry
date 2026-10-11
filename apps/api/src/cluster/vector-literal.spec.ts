import { parseVectorLiteral, toVectorLiteral } from './vector-literal';

describe('vector literals', () => {
  it('round-trips a full-width vector of finite numbers', () => {
    const values = Array.from({ length: 1536 }, (_, index) => index / 1536);
    const literal = toVectorLiteral(values);
    expect(literal.startsWith('[')).toBe(true);
    expect(parseVectorLiteral(literal)).toEqual(values);
  });

  it('rejects the wrong width and a non-finite number', () => {
    expect(() => toVectorLiteral([1, 2, 3])).toThrow(/1536/);
    const values = Array.from({ length: 1536 }, () => 0);
    values[3] = Number.NaN;
    expect(() => toVectorLiteral(values)).toThrow(/non-finite/);
  });

  it('parses the bracket text Postgres returns', () => {
    expect(parseVectorLiteral('[0.5,1,2]')).toEqual([0.5, 1, 2]);
  });
});
