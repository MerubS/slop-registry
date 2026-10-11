export type GithubUser = {
  login?: string | null;
  type?: string | null;
};

// GitHub Apps come back with type "Bot". Many of them also use a login
// like coderabbitai[bot], but a bot does not have to. A human login does
// not end in [bot]. We match the API's exact "Bot" string. Lowercasing
// would treat a made-up type as a bot, and GitHub does not send "bot".
export function isBot(user: GithubUser | null | undefined): boolean {
  if (!user) return false;
  if (user.type === 'Bot') return true;
  return typeof user.login === 'string' && user.login.endsWith('[bot]');
}
