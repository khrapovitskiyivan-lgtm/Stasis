import { describe, it, expect } from 'vitest';
import { openDb } from '../db/connection.js';
import { buildApp } from '../app.js';
import { buildBot } from './bot.js';
import { loadContent } from '../content/loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BOT_TOKEN = '123456:TESTTOKEN';
const SECRET = 'test-secret';
const WEBHOOK_SECRET = 'wh-secret';
const ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const content = loadContent(ROOT);

function buildTestApp() {
  const db = openDb(':memory:');
  const bot = buildBot({ botToken: BOT_TOKEN, miniappUrl: 'https://miniapp.example.com/', db });
  bot.botInfo = { id: 1, is_bot: true, first_name: 'B', username: 'b', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as any;
  bot.api.config.use((_prev, _method, _payload) => Promise.resolve({ ok: true, result: {} }) as any);
  return buildApp({ db, botToken: BOT_TOKEN, jwtSecret: SECRET, encKey: ENC, content, bot, webhookSecret: WEBHOOK_SECRET });
}

describe('POST /webhook', () => {
  it('rejects a missing secret header with 401', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: { update_id: 1 } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong secret header with 401', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST', url: '/webhook',
      headers: { 'x-telegram-bot-api-secret-token': 'nope' },
      payload: { update_id: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts an update with the correct secret header', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST', url: '/webhook',
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: { update_id: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it('fails closed when the webhook secret is unset (no bypass with empty header)', async () => {
    const db = openDb(':memory:');
    const bot = buildBot({ botToken: BOT_TOKEN, miniappUrl: 'https://miniapp.example.com/', db });
    bot.botInfo = { id: 1, is_bot: true, first_name: 'B', username: 'b', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as any;
    bot.api.config.use(() => Promise.resolve({ ok: true, result: {} }) as any);
    // webhookSecret intentionally omitted (undefined -> '')
    const app = buildApp({ db, botToken: BOT_TOKEN, jwtSecret: SECRET, encKey: ENC, content, bot });
    const res = await app.inject({
      method: 'POST', url: '/webhook',
      headers: { 'x-telegram-bot-api-secret-token': '' }, // the exact bypass attempt
      payload: { update_id: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('is not mounted when no bot is provided', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ db, botToken: BOT_TOKEN, jwtSecret: SECRET, encKey: ENC, content });
    const res = await app.inject({ method: 'POST', url: '/webhook', payload: { update_id: 1 } });
    expect(res.statusCode).toBe(404);
  });
});
