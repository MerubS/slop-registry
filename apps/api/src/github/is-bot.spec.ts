import { isBot } from './is-bot';

describe('isBot', () => {
  it('flags GitHub Apps by type Bot', () => {
    expect(isBot({ login: 'some-app', type: 'Bot' })).toBe(true);
  });

  it('flags logins that end in [bot], even if type is User', () => {
    expect(isBot({ login: 'coderabbitai[bot]', type: 'User' })).toBe(true);
  });

  it('flags the aviator-co/av bots we expect to see', () => {
    expect(isBot({ login: 'coderabbitai[bot]', type: 'Bot' })).toBe(true);
    expect(isBot({ login: 'gemini-code-assist[bot]', type: 'Bot' })).toBe(true);
  });

  it('does not flag a human reviewer', () => {
    expect(isBot({ login: 'jainankit', type: 'User' })).toBe(false);
  });

  it('does not treat a lowercase type as Bot', () => {
    expect(isBot({ login: 'someone', type: 'bot' })).toBe(false);
  });

  it('does not flag a login that merely contains bot', () => {
    expect(isBot({ login: 'notabot', type: 'User' })).toBe(false);
    expect(isBot({ login: 'bot-user', type: 'User' })).toBe(false);
  });

  it('does not flag a missing user', () => {
    expect(isBot(null)).toBe(false);
    expect(isBot(undefined)).toBe(false);
    expect(isBot({})).toBe(false);
  });
});
