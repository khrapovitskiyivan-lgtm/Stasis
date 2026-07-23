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
// same fixture pattern as app.test.ts / app.submit.test.ts
const fresh = () => { const n = new Date(); return sign({ user: { id: 42, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n); };

async function token(app: any) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh()}` } });
  return r.json().token;
}

describe('GET /assessment', () => {
  it('is public (no auth) and returns wheelAreas + item statements', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'GET', url: '/assessment' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.wheelAreas).toEqual(['health', 'family', 'rest', 'friends', 'career', 'hobby']);
    expect(body.elementItems.length).toBe(content.elementItems.length);
    expect(body.elementItems[0]).toEqual({ id: content.elementItems[0].id, statement: content.elementItems[0].statement });
    expect(body.strategyItems.length).toBe(content.strategyTest.items.length);
    expect(body.strategyItems[0]).toEqual({
      id: content.strategyTest.items[0].id,
      situation: content.strategyTest.items[0].situation,
      statement: content.strategyTest.items[0].statement,
    });
    expect(body.resourceItems.length).toBe(content.resourceItems.length);
    expect(body.resourceItems[0]).toEqual({ id: content.resourceItems[0].id, statement: content.resourceItems[0].statement });
  });

  it('does not leak the belief matrix, strategy profiles, or loads/key scoring fields', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'GET', url: '/assessment' });
    const raw = JSON.stringify(res.json());
    // known belief-card phrase (fire/career) — must never ship before /submit
    expect(raw).not.toContain('Деньги и цифры');
    // known strategy-profile phrase (power.coreDrive) — IP stays server-side
    expect(raw).not.toContain('Значимость через контроль');
    // scoring keys must not be exposed to the client
    expect(raw).not.toContain('"loads"');
    expect(raw).not.toContain('"key"');
  });
});

describe('POST /signal', () => {
  it('401s without a token', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'POST', url: '/signal', payload: { event: 'not_me' } });
    expect(res.statusCode).toBe(401);
  });

  it('persists a whitelisted event with meta for the authenticated user', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const res = await app.inject({
      method: 'POST', url: '/signal',
      headers: { authorization: `Bearer ${t}` },
      payload: { event: 'not_me', meta: { element: 'fire', area: 'career' } },
    });
    expect(res.statusCode).toBe(200);
    const row = db.prepare('SELECT * FROM signals').get() as any;
    expect(row.event).toBe('not_me');
    expect(JSON.parse(row.meta)).toEqual({ element: 'fire', area: 'career' });
    expect(row.user_id).toBeGreaterThan(0);
  });

  it('persists an event with no meta (nullable)', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const res = await app.inject({ method: 'POST', url: '/signal', headers: { authorization: `Bearer ${t}` }, payload: { event: 'share' } });
    expect(res.statusCode).toBe(200);
    const row = db.prepare('SELECT * FROM signals').get() as any;
    expect(row.meta).toBeNull();
  });

  it('rejects an unknown event with 400', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const res = await app.inject({ method: 'POST', url: '/signal', headers: { authorization: `Bearer ${t}` }, payload: { event: 'bogus_event' } });
    expect(res.statusCode).toBe(400);
  });
});
