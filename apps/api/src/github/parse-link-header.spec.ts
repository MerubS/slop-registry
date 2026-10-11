import { nextPageUrl, parseLinkHeader } from './parse-link-header';

// Captured from GET /repos/aviator-co/av/pulls/comments on 2026-10-11.
const REAL_HEADER =
  '<https://api.github.com/repositories/482969498/pulls/comments?sort=created&direction=desc&per_page=2&page=2>; rel="next", ' +
  '<https://api.github.com/repositories/482969498/pulls/comments?sort=created&direction=desc&per_page=2&page=424>; rel="last"';

describe('parseLinkHeader', () => {
  it('reads next and last from a real GitHub header', () => {
    const links = parseLinkHeader(REAL_HEADER);
    expect(links.next).toBe(
      'https://api.github.com/repositories/482969498/pulls/comments?sort=created&direction=desc&per_page=2&page=2',
    );
    expect(links.last).toBe(
      'https://api.github.com/repositories/482969498/pulls/comments?sort=created&direction=desc&per_page=2&page=424',
    );
  });

  it('accepts an unquoted rel', () => {
    expect(
      parseLinkHeader('<https://example.com/p?page=2>; rel=next').next,
    ).toBe('https://example.com/p?page=2');
  });

  it('returns an empty map for a missing or broken header', () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader(undefined)).toEqual({});
    expect(parseLinkHeader('not a link')).toEqual({});
  });
});

describe('nextPageUrl', () => {
  it('returns the next URL and ignores last', () => {
    expect(nextPageUrl(REAL_HEADER)).toBe(
      'https://api.github.com/repositories/482969498/pulls/comments?sort=created&direction=desc&per_page=2&page=2',
    );
  });

  it('returns null when there is no next page', () => {
    expect(
      nextPageUrl(
        '<https://api.github.com/repositories/1/pulls/comments?page=3>; rel="last"',
      ),
    ).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});
