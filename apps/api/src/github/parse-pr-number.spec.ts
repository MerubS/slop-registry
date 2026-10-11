import { parsePrNumber } from './parse-pr-number';

describe('parsePrNumber', () => {
  it('reads the number from a pull_request_url', () => {
    expect(
      parsePrNumber('https://api.github.com/repos/aviator-co/av/pulls/787'),
    ).toBe(787);
  });

  it('still reads the number if a query string follows', () => {
    expect(
      parsePrNumber(
        'https://api.github.com/repos/aviator-co/av/pulls/12?diff=1',
      ),
    ).toBe(12);
  });

  it('throws when the URL has no pull number', () => {
    expect(() =>
      parsePrNumber('https://api.github.com/repos/aviator-co/av'),
    ).toThrow(/pull request number/);
  });
});
