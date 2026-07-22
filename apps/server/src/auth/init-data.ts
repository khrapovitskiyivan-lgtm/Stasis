import { validate, parse } from '@telegram-apps/init-data-node';

export class InitDataError extends Error {}

export function verifyInitData(
  raw: string,
  botToken: string,
  maxAgeSec: number
): { tgUserId: number; username?: string; lang?: string } {
  try {
    validate(raw, botToken, { expiresIn: maxAgeSec }); // throws on bad hash, missing fields, or expiry
  } catch (e) {
    throw new InitDataError(`invalid initData: ${(e as Error).message}`);
  }
  const data = parse(raw);
  const user = data.user;
  if (!user) throw new InitDataError('initData has no user');
  return { tgUserId: user.id, username: user.username, lang: user.languageCode };
}
