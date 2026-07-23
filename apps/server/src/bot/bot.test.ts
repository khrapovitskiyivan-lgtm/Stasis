import { describe, it, expect } from 'vitest';
import { openDb } from '../db/connection.js';
import { usersRepo } from '../db/users.repo.js';
import { buildBot } from './bot.js';

const BOT_TOKEN = '123456:TESTTOKEN';
const MINIAPP_URL = 'https://miniapp.example.com/';

// grammY needs bot.botInfo before it will process an update. Setting it here
// (rather than calling bot.init()) avoids a real getMe network call in tests.
const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Stasis', username: 'stasis_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
} as any;

function fakeUpdate(update_id: number, overrides: Record<string, unknown>) {
  return {
    update_id,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 4242, type: 'private' },
      from: { id: 4242, is_bot: false, first_name: 'Ivan' },
      ...overrides,
    },
  } as any;
}

function buildTestBot() {
  const db = openDb(':memory:');
  const bot = buildBot({ botToken: BOT_TOKEN, miniappUrl: MINIAPP_URL, db });
  bot.botInfo = BOT_INFO;
  const captured: { method: string; payload: any }[] = [];
  // API transformer: intercepts outgoing calls (e.g. sendMessage) without hitting the network.
  bot.api.config.use((_prev, method, payload) => {
    captured.push({ method, payload });
    return Promise.resolve({ ok: true, result: {} }) as any;
  });
  return { db, bot, captured };
}

describe('buildBot', () => {
  it('/start replies with an inline web_app button opening the miniapp URL', async () => {
    const { bot, captured } = buildTestBot();
    await bot.handleUpdate(fakeUpdate(1, { text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] }));

    const sendCalls = captured.filter((c) => c.method === 'sendMessage');
    expect(sendCalls.length).toBe(1);
    const buttons = sendCalls[0]!.payload.reply_markup.inline_keyboard.flat();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].web_app.url).toBe(MINIAPP_URL);
  });

  it('/start with a deep-link payload does not crash', async () => {
    const { bot, captured } = buildTestBot();
    await bot.handleUpdate(
      fakeUpdate(1, { text: '/start abc123', entities: [{ type: 'bot_command', offset: 0, length: 6 }] })
    );
    expect(captured.filter((c) => c.method === 'sendMessage')).toHaveLength(1);
  });

  it('/delete_my_data hard-deletes the sender data and confirms', async () => {
    const { db, bot, captured } = buildTestBot();
    usersRepo(db).upsertByTgId(4242, 'ivan', 'ru');

    await bot.handleUpdate(
      fakeUpdate(2, { text: '/delete_my_data', entities: [{ type: 'bot_command', offset: 0, length: 15 }] })
    );

    const user = db.prepare('SELECT * FROM users WHERE tg_user_id = ?').get(4242) as any;
    expect(user.deleted_at).not.toBeNull();
    expect(user.username).toBeNull();

    const sendCalls = captured.filter((c) => c.method === 'sendMessage');
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0]!.payload.text).toMatch(/удал/i);
  });
});
