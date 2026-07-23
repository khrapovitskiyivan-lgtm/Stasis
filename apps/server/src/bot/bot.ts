import { Bot, InlineKeyboard } from 'grammy';
import type { Db } from '../db/connection.js';
import { deleteUserData } from '../db/deletion.js';

export function buildBot(deps: { botToken: string; miniappUrl: string; db: Db }): Bot {
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

  return bot;
}
