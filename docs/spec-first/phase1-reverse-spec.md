# Reverse-spec — Phase 1 (Foundation), as actually built

Spec-First v2 §3: the 6 blocks describing what the merged code **is** (not what the design spec planned). Source: `apps/server`, `packages/shared` at merge `e3118c5`. Use this, plus the marked seams, to spec Phase 2 changes without breaking working contracts.

## 1. User stories (implicit)
- As the Mini App, I exchange a Telegram `initData` string for a short-lived server session token.
- As the server, I trust identity only from a validated `initData` signature, never from client-supplied fields.

## 2. Data model
`users` (node:sqlite, `migrate.ts`):
```
id INTEGER PK AUTOINCREMENT
tg_user_id INTEGER NOT NULL UNIQUE
username TEXT NULL
lang TEXT NULL
created_at INTEGER NOT NULL          -- Date.now() ms
deleted_at INTEGER NULL              -- soft delete (no delete path yet)
```
PRAGMA: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON` (via `db.exec`). Migrations are idempotent `CREATE TABLE IF NOT EXISTS`; **no schema-version tracking yet** (seam).

## 3. Interface contract
**HTTP (`app.ts`, `buildApp({ db, botToken, jwtSecret })`):**
- `POST /auth` — header `Authorization: tma <initData>` → `200 { token: string }`; `401 { error: 'invalid_init_data' }` on bad/missing/expired initData. Constants: `AUTH_MAX_AGE_SEC = 3*3600`, `SESSION_TTL_SEC = 3600`.
- `GET /me` — header `Authorization: Bearer <jwt>` → `200 { userId, tgUserId }`; `401 { error: 'invalid_session' }` on bad token OR absent/soft-deleted user row.

**Repository (`db/users.repo.ts`, `usersRepo(db)`):**
- `upsertByTgId(tgUserId, username?, lang?) → { id, tgUserId }` (COALESCE-preserving).
- `getByTgId(tgUserId) → UserRow | undefined` (excludes soft-deleted).
- `getById(id) → UserRow | undefined` (excludes soft-deleted).
- `UserRow = { id, tgUserId, username|null, lang|null, createdAt, deletedAt|null }`.

**Auth services:**
- `verifyInitData(raw, botToken, maxAgeSec) → { tgUserId, username?, lang? }`, throws `InitDataError`.
- `issueSession(userId, secret, ttlSec) → string`; `verifySession(token, secret) → { userId }`, throws `SessionError`. HS256 pinned; payload shape re-validated.

**Shared contract (`packages/shared`):** `AREAS`(6), `ELEMENTS`(4), `STRATEGIES`(4); `WheelScoresSchema`(1..10), `LikertAnswerSchema`(1..6), `SubmitPayloadSchema = { wheel, elementAnswers, strategyAnswers, resourceAnswers }`. Types inferred.

## 4. Screens / entry points
Backend only — no UI. Entry point is the Mini App calling `POST /auth` on open, then using the returned JWT for subsequent calls.

## 5. Business logic
Validate initData (HMAC + expiry) → upsert user by tg id → issue JWT over internal `id`. `/me` verifies JWT → `getById` → return server-looked-up identity. All errors except the two typed ones rethrow to a 500 (never silently 401).

## 6. Edge cases (covered by tests)
Expired `auth_date` (>3h) → 401; tampered hash → 401; missing/empty Authorization → 401 (fails closed); bad JWT → 401; valid JWT but no live user row → 401; partial re-auth preserves username/lang.

## Seams (safe integration points for Phase 2+)
- **New tables/repos** (`test_runs`, `profiles`, `shares`, `follow_ups`, `consents`) plug into `migrate.ts` + new repo modules — do not touch `users`.
- **Submit endpoint** (`POST /submit`) will consume `SubmitPayloadSchema` (already defined incl. `strategyAnswers`) and call the engine; add it in `app.ts` alongside `/auth`,`/me` behind the JWT session guard. Extract a `requireSession` preHandler when adding the 2nd protected route (currently inline in `/me`).
- **Engine** is new pure code (`engine/`) — no dependency on Phase 1 internals beyond shared types.
- **DB access must stay in repos** — the `/me` fix established this; keep it.
- **Do not break:** the `Authorization` scheme conventions, the 401 contract, or the `Db`-type-stays-in-repos boundary.

## Known deviations from design spec
See `SPEC_CHANGELOG.md` (2026-07-23 Phase 1 reconciliation): node:sqlite, HS256 pinning, COALESCE upsert, `/me` via repo + soft-delete filter, initData double-wrap.
