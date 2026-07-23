import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/connection.js';
import { usersRepo } from './db/users.repo.js';
import { verifyInitData, InitDataError } from './auth/init-data.js';
import { issueSession, verifySession, SessionError } from './auth/session.js';

const AUTH_MAX_AGE_SEC = 3 * 3600;
const SESSION_TTL_SEC = 60 * 60;

export function buildApp(deps: { db: Db; botToken: string; jwtSecret: string }): FastifyInstance {
  const app = Fastify({ logger: false });
  const users = usersRepo(deps.db);

  app.post('/auth', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const raw = header.startsWith('tma ') ? header.slice(4) : '';
    try {
      const { tgUserId, username, lang } = verifyInitData(raw, deps.botToken, AUTH_MAX_AGE_SEC);
      const user = users.upsertByTgId(tgUserId, username, lang);
      return { token: issueSession(user.id, deps.jwtSecret, SESSION_TTL_SEC) };
    } catch (e) {
      if (e instanceof InitDataError) return reply.code(401).send({ error: 'invalid_init_data' });
      throw e;
    }
  });

  app.get('/me', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const { userId } = verifySession(token, deps.jwtSecret);
      const row = deps.db.prepare('SELECT tg_user_id FROM users WHERE id = ?').get(userId) as
        | { tg_user_id: number }
        | undefined;
      return { userId, tgUserId: row?.tg_user_id ?? null };
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
  });

  return app;
}
