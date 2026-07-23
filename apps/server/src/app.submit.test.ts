import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BOT = '123456:TESTTOKEN', SECRET = 'test-secret', ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent(ROOT);
// `sign`'s `data.user` fields are camelCase and `parse()` (inside verifyInitData)
// requires `signature` and `user.firstName` — same fixture pattern as app.test.ts.
const fresh = () => { const n = new Date(); return sign({ user: { id: 42, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n); };

async function token(app: any) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh()}` } });
  return r.json().token;
}

describe('POST /submit', () => {
  it('scores a full payload and returns a profileId + result', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const body = {
      wheel: { health: 3, family: 8, rest: 5, friends: 9, career: 2, hobby: 7 },
      elementAnswers: content.elementItems.map((i) => ({ itemId: i.id, value: 4 })),
      strategyAnswers: content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: 4 })),
      resourceAnswers: [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }],
    };
    const res = await app.inject({ method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` }, payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json().profileId).toBeGreaterThan(0);
    expect(res.json().result.leadElement).toBeDefined();
  });

  it('rejects a bad body with 400 and no session with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    expect((await app.inject({ method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` }, payload: { wheel: {} } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/submit', headers: { authorization: 'Bearer nope' }, payload: {} })).statusCode).toBe(401);
  });
});
