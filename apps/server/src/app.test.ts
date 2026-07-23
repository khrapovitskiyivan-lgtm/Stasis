import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';

const BOT = '123456:TESTTOKEN';
const SECRET = 'test-secret';

function freshInitData(): string {
  const now = new Date();
  // `sign`'s `data.user` fields are camelCase (per @telegram-apps/types),
  // and `parse()` (used inside verifyInitData) requires `signature` and
  // `user.firstName` to be present — see auth/init-data.test.ts for the
  // same fixture pattern.
  return sign(
    { user: { id: 4242, firstName: 'Ivan', username: 'ivan', languageCode: 'ru' }, signature: 'test-signature' } as any,
    BOT,
    now
  );
}

describe('app', () => {
  it('POST /auth returns a token, then GET /me resolves the user', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });

    const auth = await app.inject({
      method: 'POST', url: '/auth',
      headers: { authorization: `tma ${freshInitData()}` },
    });
    expect(auth.statusCode).toBe(200);
    const { token } = auth.json();
    expect(typeof token).toBe('string');

    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().tgUserId).toBe(4242);
  });

  it('POST /auth rejects a bad initData with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });
    const res = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: 'tma garbage' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me rejects a bad token with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });
});
