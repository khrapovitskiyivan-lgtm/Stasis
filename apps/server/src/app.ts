import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from './db/connection.js';
import { usersRepo } from './db/users.repo.js';
import { runsRepo } from './db/runs.repo.js';
import { verifyInitData, InitDataError } from './auth/init-data.js';
import { issueSession, verifySession, SessionError } from './auth/session.js';
import { SubmitPayloadSchema } from '@stasis/shared';
import { computeProfile } from './engine/index.js';
import type { ContentBundle } from './content/loader.js';

const AUTH_MAX_AGE_SEC = 3 * 3600;
const SESSION_TTL_SEC = 60 * 60;

// Extracted so /me and /submit share identical bad-token handling.
function readSession(req: FastifyRequest, secret: string): { userId: number } {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifySession(token, secret);
}

export function buildApp(deps: { db: Db; botToken: string; jwtSecret: string; encKey: string; content: ContentBundle }): FastifyInstance {
  const app = Fastify({ logger: false });
  const users = usersRepo(deps.db);
  const runs = runsRepo(deps.db, deps.encKey);

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
    try {
      const { userId } = readSession(req, deps.jwtSecret);
      const user = users.getById(userId);
      // Valid token but no live user row (deleted/orphaned) → reject, don't 200.
      if (!user) return reply.code(401).send({ error: 'invalid_session' });
      return { userId: user.id, tgUserId: user.tgUserId };
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
  });

  app.post('/submit', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    const parsed = SubmitPayloadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const profile = computeProfile(parsed.data.elementAnswers, parsed.data.strategyAnswers, parsed.data.wheel, parsed.data.resourceAnswers, deps.content);
    const { profileId } = runs.saveRun(userId, parsed.data, profile, deps.content.version);
    return { profileId, result: profile };
  });

  return app;
}
