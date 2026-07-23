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
// requires `signature` and `user.firstName` — same fixture pattern as app.submit.test.ts.
const fresh = () => { const n = new Date(); return sign({ user: { id: 42, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n); };

async function token(app: any) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh()}` } });
  return r.json().token;
}

describe('POST /consent', () => {
  it('records all-true consent as 3 rows and returns 200', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const res = await app.inject({
      method: 'POST',
      url: '/consent',
      headers: { authorization: `Bearer ${t}` },
      payload: { docVersion: '2026-07-23', pdn: true, psych: true, age18: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const rows = db.prepare('SELECT * FROM consents').all() as any[];
    expect(rows.length).toBe(3);
    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(['age18', 'pdn', 'psych']);
    for (const r of rows) {
      expect(r.doc_version).toBe('2026-07-23');
      expect(typeof r.granted_at).toBe('number');
    }
  });

  it('rejects a payload with a false flag as 400 and no token as 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const res400 = await app.inject({
      method: 'POST',
      url: '/consent',
      headers: { authorization: `Bearer ${t}` },
      payload: { docVersion: '2026-07-23', pdn: true, psych: false, age18: true },
    });
    expect(res400.statusCode).toBe(400);

    const res401 = await app.inject({
      method: 'POST',
      url: '/consent',
      payload: { docVersion: '2026-07-23', pdn: true, psych: true, age18: true },
    });
    expect(res401.statusCode).toBe(401);
  });
});
