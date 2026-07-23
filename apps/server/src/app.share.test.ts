import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BOT = '123456:TESTTOKEN', SECRET = 'test-secret', ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent(ROOT);
// Same fixture pattern as app.submit.test.ts / app.consent.test.ts.
const fresh = (tgId: number) => {
  const n = new Date();
  return sign({ user: { id: tgId, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n);
};

async function token(app: any, tgId = 42) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh(tgId)}` } });
  return r.json().token;
}

const submitBody = {
  wheel: { health: 3, family: 8, rest: 5, friends: 9, career: 2, hobby: 7 },
  elementAnswers: content.elementItems.map((i) => ({ itemId: i.id, value: 4 })),
  strategyAnswers: content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: 4 })),
  resourceAnswers: [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }],
};

async function submitProfile(app: any, t: string) {
  const res = await app.inject({ method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` }, payload: submitBody });
  return res.json().profileId as number;
}

// Pull a real, known-sensitive phrase straight from the belief matrix content
// so the leak check is a genuine assertion, not a guess at wording.
const flagshipRaw = readFileSync(resolve(ROOT, 'content/matrix/flagship-cards.yaml'), 'utf8');
const flagshipYaml = yaml.load(flagshipRaw) as any;
const KNOWN_BELIEF_PHRASE: string = flagshipYaml.sphereInsights.health.observation;

describe('POST /share + GET /share/:slug', () => {
  it('creates a slug for the caller\'s own profile and resolves it to a PII-free payload', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const profileId = await submitProfile(app, t);

    const shareRes = await app.inject({ method: 'POST', url: '/share', headers: { authorization: `Bearer ${t}` }, payload: { profileId } });
    expect(shareRes.statusCode).toBe(200);
    const { slug, url } = shareRes.json();
    expect(typeof slug).toBe('string');
    expect(slug.length).toBeGreaterThanOrEqual(12);
    expect(url).toContain(slug);

    const getRes = await app.inject({ method: 'GET', url: `/share/${slug}` });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(Object.keys(body).sort()).toEqual(['blurb', 'headline', 'leadElement']);
    expect(['fire', 'water', 'air', 'earth']).toContain(body.leadElement);
    expect(typeof body.headline).toBe('string');
    expect(typeof body.blurb).toBe('string');

    // LEAK CHECK: the public payload must contain none of the private profile
    // internals — wheel numbers, weak-area names, resource state, or belief text.
    const json = JSON.stringify(body);
    for (const wheelScore of Object.values(submitBody.wheel)) {
      expect(json.includes(String(wheelScore))).toBe(false);
    }
    for (const area of ['health', 'family', 'rest', 'friends', 'career', 'hobby']) {
      expect(json.includes(area)).toBe(false);
    }
    for (const state of ['ok', 'low', 'critical']) {
      expect(json.includes(state)).toBe(false);
    }
    expect(json.includes(KNOWN_BELIEF_PHRASE)).toBe(false);
  });

  it('rejects sharing someone else\'s profile with 403/404, unknown slug with 404, and no token with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const tOwner = await token(app, 42);
    const ownerProfileId = await submitProfile(app, tOwner);

    const tOther = await token(app, 99);

    const forbidden = await app.inject({ method: 'POST', url: '/share', headers: { authorization: `Bearer ${tOther}` }, payload: { profileId: ownerProfileId } });
    expect([403, 404]).toContain(forbidden.statusCode);

    const bogus = await app.inject({ method: 'POST', url: '/share', headers: { authorization: `Bearer ${tOther}` }, payload: { profileId: 999999 } });
    expect([403, 404]).toContain(bogus.statusCode);

    const unknownSlug = await app.inject({ method: 'GET', url: '/share/does-not-exist-slug' });
    expect(unknownSlug.statusCode).toBe(404);

    const noToken = await app.inject({ method: 'POST', url: '/share', payload: { profileId: ownerProfileId } });
    expect(noToken.statusCode).toBe(401);
  });
});

describe('GET /share/:slug/image.png', () => {
  it('returns a cacheable PNG OG image for a real slug and 404 for an unknown one', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const profileId = await submitProfile(app, t);
    const shareRes = await app.inject({ method: 'POST', url: '/share', headers: { authorization: `Bearer ${t}` }, payload: { profileId } });
    const { slug } = shareRes.json();

    const imgRes = await app.inject({ method: 'GET', url: `/share/${slug}/image.png` });
    expect(imgRes.statusCode).toBe(200);
    expect(imgRes.headers['content-type']).toBe('image/png');
    const buf = imgRes.rawPayload;
    expect(buf.length).toBeGreaterThan(0);
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // Second hit should be served from cache and return identical bytes.
    const imgRes2 = await app.inject({ method: 'GET', url: `/share/${slug}/image.png` });
    expect(imgRes2.rawPayload.equals(buf)).toBe(true);

    const missing = await app.inject({ method: 'GET', url: '/share/does-not-exist-slug/image.png' });
    expect(missing.statusCode).toBe(404);
  });
});
