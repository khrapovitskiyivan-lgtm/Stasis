import type { Bot } from 'grammy';
import type { Db } from '../db/connection.js';
import { followUpsRepo } from '../db/followups.repo.js';
import { usersRepo } from '../db/users.repo.js';

const TICK_MS = 5 * 60 * 1000;

// Module-level re-entrancy guard: prevents overlapping ticks (e.g. a slow
// send stretching past the next scheduler interval, or two manual/test
// invocations racing) from picking up and double-sending the same due rows.
let running = false;

/**
 * Sends the bot nudge for every due, unsent, non-unsubscribed follow-up row
 * and marks each as sent immediately after a successful send. Idempotent: a
 * row is only ever picked up by `due()` until `markSent` fires, so re-running
 * this against the same `now` (or later) never double-sends. Each send is
 * isolated in its own try/catch so one failure (e.g. user blocked the bot)
 * doesn't stop the rest of the batch from being processed. Concurrent calls
 * are serialized by the `running` guard: a call that arrives while another
 * is in flight is a no-op (returns 0) rather than racing over the same rows.
 */
export async function runDueFollowUps(db: Db, encKey: string, bot: Bot, now: number): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const followUps = followUpsRepo(db, encKey);
    const users = usersRepo(db);
    let sent = 0;

    for (const row of followUps.due(now)) {
      const user = users.getById(row.userId);
      if (!user) continue; // user deleted/gone — skip, do not mark sent (nothing to send).

      try {
        if (row.kind === 'checkin') {
          await bot.api.sendMessage(user.tgUserId, 'Прошло время — 2 минуты на короткий чек-ин? Посмотрим, что сдвинулось.', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Открыть чек-ин', callback_data: `checkin:${row.id}:open` }]],
            },
          });
        } else {
          await bot.api.sendMessage(user.tgUserId, `Как прошёл шаг „${row.stepText}"?`, {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Сделал', callback_data: `followup:${row.id}:done` },
                { text: 'Частично', callback_data: `followup:${row.id}:partial` },
                { text: 'Не вышло', callback_data: `followup:${row.id}:failed` },
              ]],
            },
          });
        }
        followUps.markSent(row.id);
        sent++;
      } catch (e) {
        console.error('nudge send failed', row.id, e instanceof Error ? e.message : e);
      }
    }

    return sent;
  } finally {
    running = false;
  }
}

/** Starts a periodic tick that runs due follow-ups. Returns a stop function. */
export function startScheduler(db: Db, encKey: string, bot: Bot): () => void {
  const timer = setInterval(() => {
    runDueFollowUps(db, encKey, bot, Date.now()).catch((e) => {
      console.error('follow-up scheduler tick failed', e instanceof Error ? e.message : e);
    });
  }, TICK_MS);
  // Never keep the process alive on its own (important for tests/CLI runs).
  timer.unref?.();
  return () => clearInterval(timer);
}
