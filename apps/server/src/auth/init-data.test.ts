import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { verifyInitData, InitDataError } from './init-data.js';

const BOT = '123456:TESTTOKEN';

function makeInitData(authDateSec: number): string {
  // `sign` builds a correctly-hashed initData string for tests.
  // Real API: sign(data: Omit<InitData, 'authDate' | 'hash'>, key, authDate: Date, options?)
  // `data.user` fields are camelCase (languageCode, not language_code) per @telegram-apps/types.
  // `signature` is a required string field on InitData (used for 3rd-party ed25519 validation,
  // unrelated to the HMAC `hash` this service checks) — `parse()` requires it to be present.
  return sign(
    {
      user: { id: 4242, firstName: 'Ivan', username: 'ivan', languageCode: 'ru' },
      signature: 'test-signature',
    } as any,
    BOT,
    new Date(authDateSec * 1000)
  );
}

describe('verifyInitData', () => {
  it('accepts a fresh, correctly-signed payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const res = verifyInitData(makeInitData(now), BOT, 3 * 3600);
    expect(res.tgUserId).toBe(4242);
    expect(res.username).toBe('ivan');
    expect(res.lang).toBe('ru');
  });

  it('rejects a tampered signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = makeInitData(now).replace(/hash=[a-f0-9]+/, 'hash=deadbeef');
    expect(() => verifyInitData(bad, BOT, 3 * 3600)).toThrow(InitDataError);
  });

  it('rejects stale auth_date beyond maxAge', () => {
    const old = Math.floor(Date.now() / 1000) - 4 * 3600;
    expect(() => verifyInitData(makeInitData(old), BOT, 3 * 3600)).toThrow(InitDataError);
  });
});
