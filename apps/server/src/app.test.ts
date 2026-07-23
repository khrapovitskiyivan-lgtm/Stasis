import { describe, it, expect, afterEach } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const BOT = '123456:TESTTOKEN';
const SECRET = 'test-secret';
const ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent(ROOT);

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
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });

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
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: 'tma garbage' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me rejects a bad token with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /health returns ok, region, and engineVersion with no auth', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.region).toBe('string');
    expect(body.region.length).toBeGreaterThan(0);
    expect(typeof body.engineVersion).toBe('string');
  });
});

describe('app static (Mini App SPA)', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function makeMiniappDist(): string {
    const dir = mkdtempSync(join(tmpdir(), 'stasis-miniapp-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Stasis</title><body>STASIS_MINIAPP_FIXTURE</body>');
    tmpDir = dir;
    return dir;
  }

  it('GET / serves the Mini App index.html when miniappDist is configured', async () => {
    const dist = makeMiniappDist();
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content, miniappDist: dist });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('STASIS_MINIAPP_FIXTURE');
  });

  it('GET /some/spa/route falls back to index.html for unmatched non-API GETs', async () => {
    const dist = makeMiniappDist();
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content, miniappDist: dist });
    const res = await app.inject({ method: 'GET', url: '/some/spa/route' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('STASIS_MINIAPP_FIXTURE');
  });

  it('GET /assessment still returns API JSON, not shadowed by static/SPA fallback', async () => {
    const dist = makeMiniappDist();
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content, miniappDist: dist });
    const res = await app.inject({ method: 'GET', url: '/assessment' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = res.json();
    expect(Array.isArray(body.wheelAreas)).toBe(true);
  });

  it('POST /nope still returns a JSON 404 (fallback is GET-only)', async () => {
    const dist = makeMiniappDist();
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content, miniappDist: dist });
    const res = await app.inject({ method: 'POST', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('GET / is a 404 when miniappDist is not configured (dev/tests)', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
  });
});
