import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { Bot } from 'grammy';
import { openDb } from './db/connection.js';
import { usersRepo } from './db/users.repo.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { followUpsRepo } from './db/followups.repo.js';
import { runDueFollowUps } from './followup/scheduler.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BOT = '123456:TESTTOKEN', SECRET = 'test-secret', ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent(ROOT);
const DAY = 24 * 3600 * 1000;

const fresh = (tgId = 42) => { const n = new Date(); return sign({ user: { id: tgId, firstName: 'I' }, signature: 'test-signature' } as any, BOT, n); };

async function token(app: any, tgId = 42) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh(tgId)}` } });
  return r.json().token;
}

function buildTestBot() {
  const bot = new Bot(BOT);
  bot.botInfo = {
    id: 123456, is_bot: true, first_name: 'Stasis', username: 'stasis_bot',
    can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  } as any;
  const captured: { method: string; payload: any }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    captured.push({ method, payload });
    return Promise.resolve({ ok: true, result: {} }) as any;
  });
  return { bot, captured };
}

describe('followUpsRepo', () => {
  it('schedule() then due() returns it only once dueAt has passed, with decrypted stepText; raw column is ciphertext', () => {
    const db = openDb(':memory:');
    const { id: userId } = usersRepo(db).upsertByTgId(42, 'ivan', 'ru');
    const repo = followUpsRepo(db, ENC);
    const now = Date.now();
    const dueAt = now + 3 * DAY;
    repo.schedule(userId, 'card-1', 'Позвонить маме', dueAt);

    // Not due yet.
    expect(repo.due(now)).toEqual([]);

    // Due after dueAt has passed.
    const rows = repo.due(dueAt + 1);
    expect(rows.length).toBe(1);
    expect(rows[0]!.stepText).toBe('Позвонить маме');
    expect(rows[0]!.cardRef).toBe('card-1');
    expect(rows[0]!.userId).toBe(userId);

    // Raw stored column must be ciphertext, not plaintext.
    const raw = db.prepare('SELECT step_text FROM follow_ups WHERE user_id = ?').get(userId) as any;
    expect(raw.step_text).not.toBe('Позвонить маме');
    expect(raw.step_text.includes('Позвонить')).toBe(false);
  });

  it('unsubscribe(userId) prevents a pending row from being returned as due', () => {
    const db = openDb(':memory:');
    const { id: userId } = usersRepo(db).upsertByTgId(43, 'ivan2', 'ru');
    const repo = followUpsRepo(db, ENC);
    const now = Date.now();
    repo.schedule(userId, 'card-2', 'Сделать зарядку', now + 3 * DAY);

    repo.unsubscribe(userId);

    expect(repo.due(now + 3 * DAY + 1)).toEqual([]);
  });

  it('unsubscribe persists: a follow-up scheduled AFTER opting out is never due', () => {
    const db = openDb(':memory:');
    const { id: userId } = usersRepo(db).upsertByTgId(46, 'ivan5', 'ru');
    const repo = followUpsRepo(db, ENC);
    const now = Date.now();

    repo.unsubscribe(userId); // opt out first, with no pending rows
    repo.schedule(userId, 'card-x', 'Позже', now + 3 * DAY); // then take a step later

    expect(repo.due(now + 3 * DAY + 1)).toEqual([]); // still silenced
  });
});

describe('runDueFollowUps', () => {
  it('sends the nudge once for a due row and is idempotent on a second run', async () => {
    const db = openDb(':memory:');
    const { id: userId } = usersRepo(db).upsertByTgId(44, 'ivan3', 'ru');
    const repo = followUpsRepo(db, ENC);
    const now = Date.now();
    repo.schedule(userId, 'card-3', 'Написать другу', now + 3 * DAY);

    const { bot, captured } = buildTestBot();
    const at = now + 3 * DAY + 1;

    const sentFirst = await runDueFollowUps(db, ENC, bot, at);
    expect(sentFirst).toBe(1);
    const sendCalls = captured.filter((c) => c.method === 'sendMessage');
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0]!.payload.chat_id).toBe(44);
    expect(sendCalls[0]!.payload.text).toContain('Написать другу');
    expect(sendCalls[0]!.payload.reply_markup.inline_keyboard.flat().length).toBe(3);

    const sentSecond = await runDueFollowUps(db, ENC, bot, at);
    expect(sentSecond).toBe(0);
    expect(captured.filter((c) => c.method === 'sendMessage').length).toBe(1);
  });

  it('does not send to a user who unsubscribed', async () => {
    const db = openDb(':memory:');
    const { id: userId } = usersRepo(db).upsertByTgId(45, 'ivan4', 'ru');
    const repo = followUpsRepo(db, ENC);
    const now = Date.now();
    repo.schedule(userId, 'card-4', 'Прочитать главу', now + 3 * DAY);
    repo.unsubscribe(userId);

    const { bot, captured } = buildTestBot();
    const sent = await runDueFollowUps(db, ENC, bot, now + 3 * DAY + 1);
    expect(sent).toBe(0);
    expect(captured.filter((c) => c.method === 'sendMessage')).toHaveLength(0);
  });
});

describe('POST /followup', () => {
  it('requires a bearer token, schedules on success, and rejects an empty stepText with 400', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    const noToken = await app.inject({ method: 'POST', url: '/followup', payload: { cardRef: 'card-5', stepText: 'Сделать шаг' } });
    expect(noToken.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST', url: '/followup', headers: { authorization: `Bearer ${t}` },
      payload: { cardRef: 'card-5', stepText: 'Сделать шаг' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });

    const rows = db.prepare('SELECT * FROM follow_ups').all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].sent_at).toBeNull();
    expect(rows[0].card_ref).toBe('card-5');

    const bad = await app.inject({
      method: 'POST', url: '/followup', headers: { authorization: `Bearer ${t}` },
      payload: { cardRef: 'card-6', stepText: '' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('POST /followup/unsubscribe', () => {
  it('requires a bearer token and marks the user unsubscribed', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);

    const noToken = await app.inject({ method: 'POST', url: '/followup/unsubscribe' });
    expect(noToken.statusCode).toBe(401);

    await app.inject({
      method: 'POST', url: '/followup', headers: { authorization: `Bearer ${t}` },
      payload: { cardRef: 'card-7', stepText: 'Отдохнуть' },
    });

    const res = await app.inject({ method: 'POST', url: '/followup/unsubscribe', headers: { authorization: `Bearer ${t}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const rows = db.prepare('SELECT unsubscribed FROM follow_ups').all() as any[];
    expect(rows.every((r) => r.unsubscribed === 1)).toBe(true);
  });
});
