import type { Bot } from 'grammy';
import { webhookCallback } from 'grammy';
import type { FastifyReply, FastifyRequest } from 'fastify';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** Fastify handler for the Telegram webhook: 401s unless the secret header matches, else feeds the update to grammY. */
export function webhookHandler(bot: Bot, secret: string) {
  const callback = webhookCallback(bot, 'fastify');
  return async (req: FastifyRequest, reply: FastifyReply) => {
    // Fail closed: an unset/empty secret rejects everything rather than degrading
    // to `'' !== ''` (which a client sending an empty header could satisfy).
    // Without this, a forged update could invoke /delete_my_data for any tg id.
    if (!secret || req.headers[SECRET_HEADER] !== secret) {
      return reply.code(401).send({ error: 'invalid_secret' });
    }
    return callback(req, reply);
  };
}
