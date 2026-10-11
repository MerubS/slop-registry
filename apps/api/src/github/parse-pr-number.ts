// The list-comments payload has pull_request_url, not a pull number field.
// https://api.github.com/repos/aviator-co/av/pulls/787 -> 787
export function parsePrNumber(pullRequestUrl: string): number {
  const match = pullRequestUrl.match(/\/pulls\/(\d+)(?:[/?#]|$)/);
  if (!match) {
    throw new Error(
      `Could not read a pull request number from pull_request_url: ${pullRequestUrl}`,
    );
  }
  return Number(match[1]);
}
