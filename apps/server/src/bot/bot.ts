import { Bot, InlineKeyboard } from 'grammy';
import type { Db } from '../db/connection.js';
import { deleteUserData } from '../db/deletion.js';
import { followUpsRepo } from '../db/followups.repo.js';

export function buildBot(deps: { botToken: string; miniappUrl: string; db: Db; encKey?: string }): Bot {
  const bot = new Bot(deps.botToken);

  bot.command('start', async (ctx) => {
    // Deep-link param (e.g. from a share link) arrives here as ctx.match.
    // Not persisted yet — share resolution lands in a later task — but we
    // must not crash when it's present.
    const _deepLinkParam = ctx.match;
    const keyboard = new InlineKeyboard().webApp('Пройти диагностику', deps.miniappUrl);
    await ctx.reply('Добро пожаловать!', { reply_markup: keyboard });
  });

  bot.command('delete_my_data', async (ctx) => {
    const tgUserId = ctx.from?.id;
    if (tgUserId === undefined) return;
    deleteUserData(deps.db, tgUserId);
    await ctx.reply('Ваши данные удалены.');
  });

  // Follow-up nudge reply buttons (callback_data = `followup:<id>:<done|partial|failed>`).
  // Wired only when an encryption key is available (needed to build the repo).
  if (deps.encKey) {
    const followUps = followUpsRepo(deps.db, deps.encKey);
    bot.on('callback_query:data', async (ctx) => {
      const m = /^followup:(\d+):(done|partial|failed)$/.exec(ctx.callbackQuery.data);
      if (!m) return ctx.answerCallbackQuery();
      followUps.recordReply(Number(m[1]), m[2]);
      return ctx.answerCallbackQuery({ text: 'Спасибо, записал.' });
    });
  }

  return bot;
}
