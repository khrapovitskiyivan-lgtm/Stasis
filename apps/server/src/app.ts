import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Bot } from 'grammy';
import type { Db } from './db/connection.js';
import { usersRepo } from './db/users.repo.js';
import { runsRepo, ENGINE_VERSION } from './db/runs.repo.js';
import { signalsRepo, isSignalEvent } from './db/signals.repo.js';
import { consentsRepo } from './db/consents.repo.js';
import { sharesRepo } from './db/shares.repo.js';
import { profilesRepo } from './db/profiles.repo.js';
import { followUpsRepo } from './db/followups.repo.js';
import { verifyInitData, InitDataError } from './auth/init-data.js';
import { issueSession, verifySession, SessionError } from './auth/session.js';
import { SubmitPayloadSchema, ConsentPayloadSchema, SharePublicPayloadSchema, AREAS } from '@stasis/shared';
import { computeProfile } from './engine/index.js';
import { renderResult } from './engine/render.js';
import { buildSharePayload } from './share/payload.js';
import { renderOgSvg, svgToPng } from './share/og-image.js';
import type { ContentBundle } from './content/loader.js';
import { webhookHandler } from './bot/webhook.js';

const AUTH_MAX_AGE_SEC = 3 * 3600;
const SESSION_TTL_SEC = 60 * 60;

// Extracted so /me and /submit share identical bad-token handling.
function readSession(req: FastifyRequest, secret: string): { userId: number } {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifySession(token, secret);
}

export function buildApp(deps: {
  db: Db;
  botToken: string;
  jwtSecret: string;
  encKey: string;
  content: ContentBundle;
  bot?: Bot;
  webhookSecret?: string;
  publicBaseUrl?: string;
  tgShareBaseUrl?: string;
  region?: 'ru' | 'eu';
  // Absolute path to the built Mini App `dist` (index.html + assets). When
  // set and the dir exists, the API origin also serves the SPA — see the
  // static registration + notFoundHandler below. Left unset in dev/tests so
  // `GET /` stays a plain 404 rather than silently serving stale/missing files.
  miniappDist?: string;
}): FastifyInstance {
  const app = Fastify({ logger: false });
  const region = deps.region ?? 'ru';
  const users = usersRepo(deps.db);
  const runs = runsRepo(deps.db, deps.encKey);
  const signals = signalsRepo(deps.db);
  const consents = consentsRepo(deps.db);
  const shares = sharesRepo(deps.db);
  const profiles = profilesRepo(deps.db);
  const followUps = followUpsRepo(deps.db, deps.encKey);
  const FOLLOWUP_DELAY_MS = 3 * 24 * 3600 * 1000;
  // Per-slug OG image cache: the share payload is immutable once created, so
  // a rendered PNG never goes stale. Lives for the process lifetime of this
  // app instance (MVP-scale; a later optimization could move this to disk/CDN).
  const ogImageCache = new Map<string, Buffer>();

  // Bot is optional (dev without BOT_TOKEN/MINIAPP_URL configured for the bot side).
  if (deps.bot) {
    app.post('/webhook', webhookHandler(deps.bot, deps.webhookSecret ?? ''));
  }

  // Public: liveness/deploy-sanity check. No auth, no DB access.
  app.get('/health', async () => {
    return { ok: true, region, engineVersion: ENGINE_VERSION };
  });

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

  // Public: question text is not sensitive. The belief matrix, strategy
  // profiles, and interaction guides (the IP) never leave the server until
  // /submit renders a result — only bare id+statement(+situation) ship here.
  app.get('/assessment', async () => {
    return {
      wheelAreas: AREAS,
      elementItems: deps.content.elementItems.map((i) => ({ id: i.id, statement: i.statement })),
      strategyItems: deps.content.strategyTest.items.map((i) => ({ id: i.id, situation: i.situation, statement: i.statement })),
      resourceItems: deps.content.resourceItems.map((i) => ({ id: i.id, statement: i.statement })),
    };
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
    // Parity with /me: a valid token whose user row is gone (deleted/orphaned) must not persist.
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    const parsed = SubmitPayloadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    const profile = computeProfile(parsed.data.elementAnswers, parsed.data.strategyAnswers, parsed.data.wheel, parsed.data.resourceAnswers, deps.content);
    const { profileId } = runs.saveRun(userId, parsed.data, profile, deps.content.version);
    return { profileId, result: renderResult(profile, deps.content) };
  });

  app.post('/signal', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    const body = (req.body ?? {}) as { event?: unknown; meta?: unknown };
    if (!isSignalEvent(body.event)) return reply.code(400).send({ error: 'invalid_event' });
    signals.record(userId, body.event, body.meta);
    return { ok: true };
  });

  app.post('/consent', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    // Parity with /submit and /signal: a valid token for a gone/soft-deleted user must not write.
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    const parsed = ConsentPayloadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
    consents.record(userId, parsed.data.docVersion);
    return { ok: true };
  });

  app.post('/share', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    const body = (req.body ?? {}) as { profileId?: unknown };
    const profileId = Number(body.profileId);
    if (!Number.isInteger(profileId) || profileId <= 0) return reply.code(400).send({ error: 'invalid_payload' });
    // Ownership check: a profile only shares if it belongs to the caller —
    // otherwise anyone could mint a public share link for someone else's result.
    const leadElement = profiles.getOwnedLeadElement(profileId, userId);
    if (!leadElement) return reply.code(404).send({ error: 'profile_not_found' });
    const payload = buildSharePayload(leadElement);
    const { slug } = shares.create(profileId, userId, payload);
    // Deep link opens the Mini App in Telegram (t.me/<bot>), NOT the API origin.
    return { slug, url: `${deps.tgShareBaseUrl ?? ''}?startapp=${slug}` };
  });

  // Public: resolve a share slug to its witness-copy payload only. No auth,
  // no PII, no wheel/spheres/answers/belief text — see share/payload.ts.
  app.get('/share/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const row = shares.getBySlug(slug);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return row.publicPayload;
  });

  // Public: OG/Telegram-preview PNG for a share slug. The payload is
  // immutable once a slug exists, so we render lazily on first request and
  // cache the PNG bytes in-memory per slug — no re-render on repeat hits.
  app.get('/share/:slug/image.png', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const cached = ogImageCache.get(slug);
    if (cached) return reply.type('image/png').send(cached);

    const row = shares.getBySlug(slug);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const parsed = SharePublicPayloadSchema.safeParse(row.publicPayload);
    if (!parsed.success) return reply.code(404).send({ error: 'not_found' });

    const png = svgToPng(renderOgSvg(parsed.data));
    ogImageCache.set(slug, png);
    return reply.type('image/png').send(png);
  });

  app.post('/followup', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    const body = (req.body ?? {}) as { cardRef?: unknown; stepText?: unknown };
    if (typeof body.cardRef !== 'string' || body.cardRef.length === 0 ||
        typeof body.stepText !== 'string' || body.stepText.length === 0) {
      return reply.code(400).send({ error: 'invalid_payload' });
    }
    followUps.schedule(userId, body.cardRef, body.stepText, Date.now() + FOLLOWUP_DELAY_MS);
    return { ok: true };
  });

  app.post('/followup/unsubscribe', async (req, reply) => {
    let userId: number;
    try {
      userId = readSession(req, deps.jwtSecret).userId;
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
    if (!users.getById(userId)) return reply.code(401).send({ error: 'invalid_session' });
    followUps.unsubscribe(userId);
    return { ok: true };
  });

  // Serve the Mini App SPA from this same origin (single TLS cert, single
  // web_app URL for Telegram). Only wired up when a built dist is provided —
  // dev/tests without it keep `GET /` as a plain 404. `wildcard: false` means
  // @fastify/static only serves exact file matches (assets); it does NOT
  // register a catch-all route, so unmatched paths still fall through to
  // notFoundHandler below, which is where the SPA (index.html) fallback lives.
  if (deps.miniappDist && existsSync(deps.miniappDist)) {
    const miniappDist = deps.miniappDist;
    app.register(fastifyStatic, { root: miniappDist, wildcard: false });

    // Requests under these prefixes are API routes: if none of them matched
    // (typo'd path, wrong method, etc.) the caller gets a JSON 404, never the
    // SPA's index.html. Everything else on GET is assumed to be a client-side
    // route the React Mini App router owns, so it gets index.html instead.
    const API_PREFIXES = ['/auth', '/me', '/submit', '/assessment', '/signal', '/consent', '/share', '/followup', '/webhook', '/health'];
    app.setNotFoundHandler((req, reply) => {
      const isApiPath = API_PREFIXES.some((p) => req.url === p || req.url.startsWith(p + '/') || req.url.startsWith(p + '?'));
      if (req.method === 'GET' && !isApiPath) {
        return reply.sendFile('index.html', miniappDist);
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
