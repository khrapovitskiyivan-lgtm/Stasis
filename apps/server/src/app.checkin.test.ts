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
// Same fixture pattern as app.submit.test.ts: `sign`'s `data.user` fields are
// camelCase and `parse()` (inside verifyInitData) requires `signature` and
// `user.firstName`.
const fresh = () => { const n = new Date(); return sign({ user: { id: 42, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n); };

async function token(app: any) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh()}` } });
  return r.json().token;
}

const wheel = { health: 5, family: 5, rest: 5, friends: 5, career: 5, hobby: 5 };

describe('GET /checkin', () => {
  it('requires auth and returns null memory anchors when the user has no history', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    const noToken = await app.inject({ method: 'GET', url: '/checkin' });
    expect(noToken.statusCode).toBe(401);

    const res = await app.inject({ method: 'GET', url: '/checkin', headers: { authorization: `Bearer ${t}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ lastStep: null, lastWheel: null });
  });

  it('surfaces the latest scheduled step and latest wheel', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    await app.inject({
      method: 'POST', url: '/followup', headers: { authorization: `Bearer ${t}` },
      payload: { cardRef: 'card-1', stepText: 'Позвонить маме' },
    });
    await app.inject({
      method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` },
      payload: {
        wheel,
        elementAnswers: content.elementItems.map((i: any) => ({ itemId: i.id, value: 4 })),
        strategyAnswers: content.strategyTest.items.map((i: any) => ({ itemId: `s${i.id}`, value: 4 })),
        resourceAnswers: [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }],
      },
    });

    const res = await app.inject({ method: 'GET', url: '/checkin', headers: { authorization: `Bearer ${t}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ lastStep: { text: 'Позвонить маме', cardRef: 'card-1' }, lastWheel: wheel });
  });
});

describe('POST /checkin', () => {
  it('rejects without auth and rejects an invalid body', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    const noToken = await app.inject({ method: 'POST', url: '/checkin', payload: {} });
    expect(noToken.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'POST', url: '/checkin', headers: { authorization: `Bearer ${t}` },
      payload: { wheel: {}, energy: 99, stepRef: null, stepOutcome: null, note: null },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('saves the checkin, returns a digest with a step observation, and schedules the next check-in nudge', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    // Seed an onboarding wheel snapshot so the digest has a prior data point.
    await app.inject({
      method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` },
      payload: {
        wheel,
        elementAnswers: content.elementItems.map((i: any) => ({ itemId: i.id, value: 4 })),
        strategyAnswers: content.strategyTest.items.map((i: any) => ({ itemId: `s${i.id}`, value: 4 })),
        resourceAnswers: [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }],
      },
    });

    const res = await app.inject({
      method: 'POST', url: '/checkin', headers: { authorization: `Bearer ${t}` },
      payload: { wheel, energy: 4, stepRef: null, stepOutcome: 'done', note: null },
    });
    expect(res.statusCode).toBe(200);
    const { digest } = res.json();
    expect(digest.observations.some((o: any) => o.kind === 'step' && o.outcome === 'done')).toBe(true);
    expect(digest.nextStep).toBe('new');
    expect(digest.safety).toBe(false);

    const checkinRows = db.prepare('SELECT * FROM checkins').all() as any[];
    expect(checkinRows.length).toBe(1);

    const dueRows = db.prepare(`SELECT * FROM follow_ups WHERE kind = 'checkin'`).all() as any[];
    expect(dueRows.length).toBe(1);
    // Scheduled ~14 days out.
    expect(dueRows[0].due_at).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);
  });
});

describe('check-in nudge copy — forbidden lexicon', () => {
  it('contains no diagnostic/therapeutic/guarantee language', () => {
    const nudges = [
      'Прошло время — 2 минуты на короткий чек-ин? Посмотрим, что сдвинулось.',
      'Спасибо, записал.',
    ];
    const forbidden = /диагноз|лечени|терапи|гаранти|расстройств/i;
    for (const text of nudges) expect(text).not.toMatch(forbidden);
  });
});
