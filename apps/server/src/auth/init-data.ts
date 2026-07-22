import { validate, parse } from '@telegram-apps/init-data-node';

export class InitDataError extends Error {}

export function verifyInitData(
  raw: string,
  botToken: string,
  maxAgeSec: number
): { tgUserId: number; username?: string; lang?: string } {
  let data: ReturnType<typeof parse>;
  try {
    // validate: real HMAC signature check + auth_date expiry (expiresIn).
    // parse must share the try/catch: a correctly-signed initData that omits
    // the `signature` param passes validate() but makes parse() throw a raw
    // library error — we must surface that as InitDataError too.
    validate(raw, botToken, { expiresIn: maxAgeSec });
    data = parse(raw);
  } catch (e) {
    throw new InitDataError(`invalid initData: ${(e as Error).message}`, { cause: e });
  }
  const user = data.user;
  if (!user) throw new InitDataError('initData has no user');
  return { tgUserId: user.id, username: user.username, lang: user.languageCode };
}
