# Stasis MVP — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the backend foundation — monorepo, shared validation schemas, SQLite persistence, Telegram `initData` validation, and JWT sessions — so a Telegram user can authenticate and the server can trust their identity.

**Architecture:** pnpm monorepo with `apps/server` (Fastify + grammY, one process), `packages/shared` (zod schemas as the single source of the client↔server contract), and `content/` (matrix, later phases). The server validates the raw `initData` string from the Mini App, then issues a short-lived JWT the client uses for subsequent requests. All persistence goes through a thin repository layer over `better-sqlite3` so a later Postgres migration is localized.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Fastify 4, grammY (added Phase 4), better-sqlite3, zod, jsonwebtoken, @telegram-apps/init-data-node, vitest.

## Global Constraints

- Node.js ≥ 20 LTS; TypeScript `strict: true`; ESM modules (`"type": "module"`).
- Package manager: **pnpm** (workspaces). No npm/yarn lockfiles.
- SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`. No native build / node-gyp / Visual Studio required.
- All request/response bodies validated by zod schemas from `packages/shared` — never trust client-computed values (profile, scores are recomputed server-side in Phase 2).
- `initData` validated on every protected request; `auth_date` older than **3 hours** is rejected.
- Secrets only from environment (`BOT_TOKEN`, `JWT_SECRET`); never committed. `.env` is git-ignored.
- Sensitive raw data (test answers, wheel scores) is encrypted at rest in later phases; Phase 1 stores only `users` (no sensitive psychological data yet).
- `node:sqlite` is built into Node ≥22.5 (present on Node 24) — no external SQLite dependency, no compilation. Stable in Node 24 (no runtime flag, no experimental warning). This replaces `better-sqlite3`, whose native build fails on this machine's toolchain.
- Tests: **vitest**. Every task ends green before commit.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.nvmrc`
- Modify: `.gitignore` (already exists — verify entries)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: workspace layout `apps/*`, `packages/*`; shared TS base config at `tsconfig.base.json`; scripts `pnpm -r typecheck`, `pnpm -r test`.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "stasis",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Create `.env.example` and `.nvmrc`**

`.env.example`:
```
BOT_TOKEN=123456:REPLACE_ME
JWT_SECRET=replace-with-64-char-random-hex
DATABASE_PATH=./data/stasis.sqlite
```
`.nvmrc`:
```
20
```

- [ ] **Step 5: Verify `.gitignore` covers `node_modules/`, `.env`, `*.sqlite`, `dist/`**

Read `.gitignore`; it already lists these. If any missing, add it.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example .nvmrc .gitignore
git commit -m "chore: monorepo scaffold with pnpm workspaces"
```

---

### Task 2: Shared contract schemas (`packages/shared`)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json`.
- Produces: zod schemas and inferred types exported from `@stasis/shared`:
  - `AREAS = ['health','family','rest','friends','career','hobby'] as const`
  - `ELEMENTS = ['fire','water','air','earth'] as const`
  - `WheelScoresSchema` → `Record<Area, 1..10>`
  - `LikertAnswerSchema` → `{ itemId: string; value: 1..6 }`
  - `STRATEGIES = ['power','attention','superiority','avoidance'] as const`
  - `SubmitPayloadSchema` → `{ wheel: WheelScores; elementAnswers: LikertAnswer[]; strategyAnswers: LikertAnswer[]; resourceAnswers: LikertAnswer[] }`
  - Types: `Area`, `Element`, `Strategy`, `WheelScores`, `LikertAnswer`, `SubmitPayload`.

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@stasis/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Write the failing test** — `packages/shared/src/schemas.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { WheelScoresSchema, SubmitPayloadSchema } from './schemas.js';

describe('WheelScoresSchema', () => {
  it('accepts all six areas within 1..10', () => {
    const ok = { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 };
    expect(WheelScoresSchema.parse(ok)).toEqual(ok);
  });
  it('rejects out-of-range and missing areas', () => {
    expect(() => WheelScoresSchema.parse({ health: 11, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 })).toThrow();
    expect(() => WheelScoresSchema.parse({ health: 3 })).toThrow();
  });
});

describe('SubmitPayloadSchema', () => {
  it('accepts a full payload', () => {
    const p = {
      wheel: { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 },
      elementAnswers: [{ itemId: 'e1', value: 6 }],
      strategyAnswers: [{ itemId: 's1', value: 4 }],
      resourceAnswers: [{ itemId: 'r1', value: 2 }],
    };
    expect(SubmitPayloadSchema.parse(p)).toEqual(p);
  });
  it('rejects a Likert value of 7', () => {
    expect(() => SubmitPayloadSchema.parse({
      wheel: { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 },
      elementAnswers: [{ itemId: 'e1', value: 7 }],
      strategyAnswers: [],
      resourceAnswers: [],
    })).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @stasis/shared test`
Expected: FAIL — cannot resolve `./schemas.js`.

- [ ] **Step 5: Implement `packages/shared/src/schemas.ts`**

```ts
import { z } from 'zod';

export const AREAS = ['health', 'family', 'rest', 'friends', 'career', 'hobby'] as const;
export const ELEMENTS = ['fire', 'water', 'air', 'earth'] as const;
export const STRATEGIES = ['power', 'attention', 'superiority', 'avoidance'] as const;
export type Area = (typeof AREAS)[number];
export type Element = (typeof ELEMENTS)[number];
export type Strategy = (typeof STRATEGIES)[number];

const score1to10 = z.number().int().min(1).max(10);
export const WheelScoresSchema = z.object(
  Object.fromEntries(AREAS.map((a) => [a, score1to10])) as Record<Area, typeof score1to10>
);
export type WheelScores = z.infer<typeof WheelScoresSchema>;

export const LikertAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.number().int().min(1).max(6),
});
export type LikertAnswer = z.infer<typeof LikertAnswerSchema>;

export const SubmitPayloadSchema = z.object({
  wheel: WheelScoresSchema,
  elementAnswers: z.array(LikertAnswerSchema),
  strategyAnswers: z.array(LikertAnswerSchema),
  resourceAnswers: z.array(LikertAnswerSchema),
});
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```ts
export * from './schemas.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @stasis/shared test`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): wheel and likert zod schemas as client-server contract"
```

---

### Task 3: SQLite persistence + users repository (`apps/server`)

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/db/connection.ts`
- Create: `apps/server/src/db/migrate.ts`
- Create: `apps/server/src/db/users.repo.ts`
- Test: `apps/server/src/db/users.repo.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `openDb(path: string): Db` — `node:sqlite` `DatabaseSync` handle with WAL + busy_timeout, migrations applied.
  - `usersRepo(db)` → `{ upsertByTgId(tgUserId: number, username?: string, lang?: string): { id: number; tgUserId: number }; getByTgId(tgUserId: number): UserRow | undefined }`.
  - `UserRow = { id: number; tgUserId: number; username: string | null; lang: string | null; createdAt: number; deletedAt: number | null }`.

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@stasis/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/main.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@stasis/shared": "workspace:*",
    "fastify": "^4.28.0",
    "jsonwebtoken": "^9.0.2",
    "@telegram-apps/init-data-node": "^1.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

- [ ] **Step 3: Write the failing test** — `apps/server/src/db/users.repo.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { usersRepo } from './users.repo.js';

describe('usersRepo', () => {
  it('upserts by tgUserId idempotently and reads back', () => {
    const db = openDb(':memory:');
    const repo = usersRepo(db);
    const a = repo.upsertByTgId(4242, 'ivan', 'ru');
    const b = repo.upsertByTgId(4242, 'ivan_new', 'ru');
    expect(a.id).toBe(b.id); // same user, not duplicated
    const row = repo.getByTgId(4242);
    expect(row?.tgUserId).toBe(4242);
    expect(row?.username).toBe('ivan_new'); // username refreshed
  });

  it('returns undefined for unknown user', () => {
    const db = openDb(':memory:');
    expect(usersRepo(db).getByTgId(999)).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test`
Expected: FAIL — cannot resolve `./connection.js`.

- [ ] **Step 5: Implement `apps/server/src/db/connection.ts`**

```ts
import { createRequire } from 'node:module';
import { runMigrations } from './migrate.js';

// node:sqlite is a builtin only under its prefixed name. Vitest's Vite
// pipeline strips the "node:" prefix and then fails to resolve bare
// "sqlite". Loading it via createRequire at runtime bypasses Vite's static
// resolution entirely (Vite only sees "node:module", a classic builtin it
// handles). In plain Node this is just a normal builtin require.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type Db = InstanceType<typeof DatabaseSync>;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}
```

Notes:
- **Do NOT `import { DatabaseSync } from 'node:sqlite'` directly** — that static import breaks under Vitest/Vite (Vite strips `node:` and cannot resolve bare `sqlite`, since `sqlite` is a builtin only under its prefixed name). The `createRequire` form above is required and needs no vitest config.
- `migrate.ts` and `users.repo.ts` below are unchanged — they use `db.exec(...)` and `db.prepare(...).run/get(...)`, which `DatabaseSync` supports with the same shapes (`run` → `{ changes, lastInsertRowid }`, `get` → row object | undefined). Type imports of `Db` resolve to `InstanceType<typeof DatabaseSync>`.

- [ ] **Step 6: Implement `apps/server/src/db/migrate.ts`**

```ts
import type { Db } from './connection.js';

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_user_id  INTEGER NOT NULL UNIQUE,
      username    TEXT,
      lang        TEXT,
      created_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    );
  `);
}
```

- [ ] **Step 7: Implement `apps/server/src/db/users.repo.ts`**

```ts
import type { Db } from './connection.js';

export interface UserRow {
  id: number;
  tgUserId: number;
  username: string | null;
  lang: string | null;
  createdAt: number;
  deletedAt: number | null;
}

export function usersRepo(db: Db) {
  const insert = db.prepare(
    `INSERT INTO users (tg_user_id, username, lang, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tg_user_id) DO UPDATE SET
       username = COALESCE(excluded.username, users.username),
       lang = COALESCE(excluded.lang, users.lang)`
  );
  const select = db.prepare(`SELECT * FROM users WHERE tg_user_id = ?`);
  const map = (r: any): UserRow | undefined =>
    r && { id: r.id, tgUserId: r.tg_user_id, username: r.username, lang: r.lang, createdAt: r.created_at, deletedAt: r.deleted_at };

  return {
    upsertByTgId(tgUserId: number, username?: string, lang?: string) {
      insert.run(tgUserId, username ?? null, lang ?? null, Date.now());
      const row = map(select.get(tgUserId))!;
      return { id: row.id, tgUserId: row.tgUserId };
    },
    getByTgId(tgUserId: number): UserRow | undefined {
      return map(select.get(tgUserId));
    },
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/src/db
git commit -m "feat(server): sqlite connection with WAL and users repository"
```

---

### Task 4: Telegram `initData` validation service

**Files:**
- Create: `apps/server/src/auth/init-data.ts`
- Test: `apps/server/src/auth/init-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `verifyInitData(raw: string, botToken: string, maxAgeSec: number): { tgUserId: number; username?: string; lang?: string }` — throws `InitDataError` on invalid signature or when `auth_date` is older than `maxAgeSec`.

- [ ] **Step 1: Write the failing test** — `apps/server/src/auth/init-data.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { verifyInitData, InitDataError } from './init-data.js';

const BOT = '123456:TESTTOKEN';

function makeInitData(authDateSec: number): string {
  // `sign` builds a correctly-hashed initData string for tests.
  return sign(
    { user: { id: 4242, username: 'ivan', language_code: 'ru' }, auth_date: new Date(authDateSec * 1000) } as any,
    BOT,
    new Date(authDateSec * 1000)
  );
}

describe('verifyInitData', () => {
  it('accepts a fresh, correctly-signed payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const res = verifyInitData(makeInitData(now), BOT, 3 * 3600);
    expect(res.tgUserId).toBe(4242);
    expect(res.username).toBe('ivan');
  });

  it('rejects a tampered signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = makeInitData(now).replace(/hash=[a-f0-9]+/, 'hash=deadbeef');
    expect(() => verifyInitData(bad, BOT, 3 * 3600)).toThrow(InitDataError);
  });

  it('rejects stale auth_date beyond maxAge', () => {
    const old = Math.floor(Date.now() / 1000) - 4 * 3600;
    expect(() => verifyInitData(makeInitData(old), BOT, 3 * 3600)).toThrow(InitDataError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/auth/init-data.test.ts`
Expected: FAIL — cannot resolve `./init-data.js`.

- [ ] **Step 3: Implement `apps/server/src/auth/init-data.ts`**

```ts
import { validate, parse } from '@telegram-apps/init-data-node';

export class InitDataError extends Error {}

export function verifyInitData(raw: string, botToken: string, maxAgeSec: number) {
  try {
    validate(raw, botToken, { expiresIn: maxAgeSec }); // throws on bad hash or expiry
  } catch (e) {
    throw new InitDataError(`invalid initData: ${(e as Error).message}`);
  }
  const data = parse(raw);
  const user = data.user;
  if (!user) throw new InitDataError('initData has no user');
  return { tgUserId: user.id, username: user.username, lang: user.languageCode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/auth/init-data.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/init-data.ts apps/server/src/auth/init-data.test.ts
git commit -m "feat(server): telegram initData validation with expiry"
```

---

### Task 5: JWT session issue/verify

**Files:**
- Create: `apps/server/src/auth/session.ts`
- Test: `apps/server/src/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `issueSession(userId: number, secret: string, ttlSec: number): string`
  - `verifySession(token: string, secret: string): { userId: number }` — throws `SessionError` on invalid/expired token.

- [ ] **Step 1: Write the failing test** — `apps/server/src/auth/session.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { issueSession, verifySession, SessionError } from './session.js';

const SECRET = 'test-secret-0123456789';

describe('session', () => {
  it('round-trips userId', () => {
    const token = issueSession(7, SECRET, 3600);
    expect(verifySession(token, SECRET).userId).toBe(7);
  });
  it('rejects a token signed with a different secret', () => {
    const token = issueSession(7, SECRET, 3600);
    expect(() => verifySession(token, 'other-secret')).toThrow(SessionError);
  });
  it('rejects an expired token', () => {
    const token = issueSession(7, SECRET, -1); // already expired
    expect(() => verifySession(token, SECRET)).toThrow(SessionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/auth/session.test.ts`
Expected: FAIL — cannot resolve `./session.js`.

- [ ] **Step 3: Implement `apps/server/src/auth/session.ts`**

```ts
import jwt from 'jsonwebtoken';

export class SessionError extends Error {}

export function issueSession(userId: number, secret: string, ttlSec: number): string {
  return jwt.sign({ uid: userId }, secret, { expiresIn: ttlSec });
}

export function verifySession(token: string, secret: string): { userId: number } {
  try {
    const payload = jwt.verify(token, secret) as { uid: number };
    return { userId: payload.uid };
  } catch (e) {
    throw new SessionError(`invalid session: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/auth/session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/session.ts apps/server/src/auth/session.test.ts
git commit -m "feat(server): jwt session issue and verify"
```

---

### Task 6: Fastify app — `/auth` and `/me`

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/main.ts`
- Test: `apps/server/src/app.test.ts`

**Interfaces:**
- Consumes: `openDb`, `usersRepo` (Task 3), `verifyInitData` (Task 4), `issueSession`/`verifySession` (Task 5).
- Produces:
  - `buildApp(deps: { db: Db; botToken: string; jwtSecret: string }): FastifyInstance` with:
    - `POST /auth` — header `Authorization: tma <initData>` → `{ token: string }`; 401 on bad initData.
    - `GET /me` — header `Authorization: Bearer <jwt>` → `{ userId, tgUserId }`; 401 on bad session.
  - `loadConfig(): { botToken; jwtSecret; dbPath; port }` from env.

- [ ] **Step 1: Write the failing test** — `apps/server/src/app.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';

const BOT = '123456:TESTTOKEN';
const SECRET = 'test-secret';

function freshInitData(): string {
  const now = new Date();
  return sign({ user: { id: 4242, username: 'ivan', language_code: 'ru' }, auth_date: now } as any, BOT, now);
}

describe('app', () => {
  it('POST /auth returns a token, then GET /me resolves the user', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });

    const auth = await app.inject({
      method: 'POST', url: '/auth',
      headers: { authorization: `tma ${freshInitData()}` },
    });
    expect(auth.statusCode).toBe(200);
    const { token } = auth.json();
    expect(typeof token).toBe('string');

    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().tgUserId).toBe(4242);
  });

  it('POST /auth rejects a bad initData with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });
    const res = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: 'tma garbage' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me rejects a bad token with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET });
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/app.test.ts`
Expected: FAIL — cannot resolve `./app.js`.

- [ ] **Step 3: Implement `apps/server/src/app.ts`**

```ts
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
      const row = deps.db.prepare('SELECT tg_user_id FROM users WHERE id = ?').get(userId) as any;
      return { userId, tgUserId: row?.tg_user_id ?? null };
    } catch (e) {
      if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' });
      throw e;
    }
  });

  return app;
}
```

- [ ] **Step 4: Implement `apps/server/src/config.ts`**

```ts
export function loadConfig() {
  const { BOT_TOKEN, JWT_SECRET, DATABASE_PATH, PORT } = process.env;
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
  return {
    botToken: BOT_TOKEN,
    jwtSecret: JWT_SECRET,
    dbPath: DATABASE_PATH ?? './data/stasis.sqlite',
    port: Number(PORT ?? 3000),
  };
}
```

- [ ] **Step 5: Implement `apps/server/src/main.ts`**

```ts
import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const app = buildApp({ db: openDb(cfg.dbPath), botToken: cfg.botToken, jwtSecret: cfg.jwtSecret });
app.listen({ port: cfg.port, host: '0.0.0.0' }).then(() => {
  console.log(`stasis server on :${cfg.port}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/app.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run full workspace checks**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: all packages typecheck clean, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/app.ts apps/server/src/main.ts apps/server/src/app.test.ts
git commit -m "feat(server): fastify app with /auth (initData->jwt) and /me"
```

---

## Self-Review

**Spec coverage (Phase 1 slice of §7–§9):**
- Monorepo `apps/server` + `packages/shared` → Tasks 1–2. ✓
- SQLite `better-sqlite3` + WAL + repository layer → Task 3. ✓
- `initData` validation, `auth_date` 3h window, готовая либа → Task 4. ✓
- Server-side JWT session → Task 5. ✓
- Model of trust: client sends raw initData; server issues session → Task 6. ✓
- `content/matrix`, `apps/miniapp`, encryption, webhook secret, OG image, follow-up → **out of Phase 1 scope** (Phases 2–4). Noted, not gaps.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every run step has an exact command and expected result.

**Type consistency:** `openDb`/`Db`, `usersRepo.upsertByTgId`/`getByTgId`, `verifyInitData` return shape (`tgUserId`/`username`/`lang`), `issueSession`/`verifySession` (`userId`) are used identically across Tasks 3–6. `Authorization: tma <initData>` and `Bearer <jwt>` conventions consistent between Task 6 impl and tests.

**Note for executor:** `@telegram-apps/init-data-node` API (`validate`/`parse`/`sign`) — confirm the installed version exposes these names; if the package renamed `validate`→`validate3rd` or changed `expiresIn`, adapt Task 4 accordingly (behavior contract stays: throw on bad hash / stale `auth_date`).

---

*Phase 1 delivers an authenticating backend. Phase 2 (engine + content) consumes `packages/shared` schemas and adds the scoring/insight functions and the content-matrix loader.*
