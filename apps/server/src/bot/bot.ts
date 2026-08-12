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

  // Follow-up nudge reply buttons (callback_data = `followup:<id>:<done|partial|failed>`)
  // and the check-in nudge's open button (callback_data = `checkin:<id>:open`).
  // Wired only when an encryption key is available (needed to build the repo).
  if (deps.encKey) {
    const followUps = followUpsRepo(deps.db, deps.encKey);
    bot.on('callback_query:data', async (ctx) => {
      const followUpMatch = /^followup:(\d+):(done|partial|failed)$/.exec(ctx.callbackQuery.data);
      if (followUpMatch) {
        followUps.recordReply(Number(followUpMatch[1]), followUpMatch[2]);
        return ctx.answerCallbackQuery({ text: 'Спасибо, записал.' });
      }

      const checkinMatch = /^checkin:(\d+):open$/.exec(ctx.callbackQuery.data);
      if (checkinMatch) {
        // A callback answer can't itself launch a Mini App with an arbitrary
        // URL (Telegram only allows game/t.me URLs there) — same as /start,
        // send a fresh message with a web_app inline button to open the app.
        const keyboard = new InlineKeyboard().webApp('Открыть чек-ин', deps.miniappUrl);
        await ctx.reply('Открываю чек-ин', { reply_markup: keyboard });
        return ctx.answerCallbackQuery();
      }

      return ctx.answerCallbackQuery();
    });
  }

  return bot;
}
