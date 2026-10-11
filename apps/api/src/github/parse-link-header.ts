// GitHub pagination uses the HTTP Link header, not a page count we can trust
// up front. Example (one line):
// <https://api.github.com/repositories/1/pulls/comments?page=2>; rel="next",
// <https://api.github.com/repositories/1/pulls/comments?page=9>; rel="last"
//
// The next URL is often /repositories/{id}/... rather than /repos/{owner}/{repo}/...
// so we follow the URL GitHub gave us instead of building page=2 ourselves.

export function parseLinkHeader(
  header: string | null | undefined,
): Record<string, string> {
  const links: Record<string, string> = {};
  if (!header) return links;

  for (const part of header.split(',')) {
    const urlMatch = part.match(/<([^>]+)>/);
    const relMatch = part.match(/;\s*rel="?([^";]+)"?/i);
    if (!urlMatch || !relMatch) continue;
    links[relMatch[1]] = urlMatch[1];
  }

  return links;
}

export function nextPageUrl(header: string | null | undefined): string | null {
  return parseLinkHeader(header).next ?? null;
}
