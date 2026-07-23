# Stasis MVP — Phase 5: Deploy Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development for the CODE tasks (1–3). The infra/content deliverables (4–6) are authored directly by the controller. Steps use checkbox (`- [ ]`).
> Makes the MVP deployable to a single RU Compute VM (Yandex Cloud, 152-ФЗ), region-agnostic in code, with a real migration path and OG fonts. Design spec + SPEC_CHANGELOG deploy prereqs. Draft deploy doc: `docs/deploy/yandex-cloud.md`.

**Goal:** One HTTPS origin serving the Mini App + API + bot webhook from a single Node process on a VM, with versioned DB migrations, region config, OG fonts, containerized run (Docker Compose + Caddy auto-HTTPS), and a concrete runbook.

**Architecture:** Fastify serves `apps/miniapp/dist` (SPA) AND the API AND `/webhook` on one origin (client uses relative `VITE_API_BASE=''`). Caddy in front for auto-HTTPS (Let's Encrypt, `DOMAIN` env). node:sqlite on the VM disk. `REGION` env (default `ru`) is the only region axis; a second region later = another deployment, not a rewrite. No vendor-specific SDKs (portability preserved).

**Tech Stack:** existing stack + `@fastify/static`, Docker, Caddy. Noto fonts installed in the image (Cyrillic + color emoji) for resvg.

## Global Constraints

- TS strict; ESM; pnpm; Vitest. All DB access via repos. No Yandex-specific SDKs (keep cloud-agnostic).
- **Region as config, not code:** `REGION` env → `config.region`; region-specific values (data-residency note, crisis-support contacts, default policy/offer URLs) live in a `regions` map. Default `ru`. Code must run identically for a future `eu`.
- **Migrations:** a `schema_version` table + ordered, idempotent, forward-only migrations. Existing tables become migration 001 (so a fresh DB and any already-existing DB converge). Never silently skip a schema change again.
- Serving static must NOT shadow API routes; SPA fallback only for non-API GETs.
- Secrets from env; `.env` git-ignored; nothing sensitive in the image or logs. Fonts bundled in the image (not the git repo).
- Live Telegram/webhook/OG-preview verification needs the deployed public HTTPS host + a domain + BotFather Mini App setup — user infra actions, out of scope for tests; the runbook lists them.

---

### Task 1: Region config + health endpoint

**Files:**
- Create: `apps/server/src/regions.ts`
- Modify: `apps/server/src/config.ts` (`region`), `apps/server/src/app.ts` (`GET /health`)
- Test: `apps/server/src/regions.test.ts`, extend `app.test.ts` (health)

**Interfaces:**
- Produces: `REGIONS: Record<'ru'|'eu', { dataResidency: string; crisisSupport: string; policyUrl?: string; offerUrl?: string }>`; `config.region` (env `REGION`, default `'ru'`, validated ∈ keys); `regionConfig(region)`; `GET /health` → `200 { ok: true, region, engineVersion }`.

- [ ] **Step 1: failing test** — `regions.test.ts`: `regionConfig('ru')` returns RU data-residency + a RU crisis-support string; unknown region throws. `app.test.ts`: `GET /health` → 200 with `ok:true` + region.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `regions.ts` (ru filled with a real RU all-Russia psychological-help line placeholder text «Если сейчас тяжело — можно обратиться…»; eu stubbed), `config.region` (validate against REGIONS keys, throw on unknown), `GET /health`.
- [ ] **Step 4: run + pass; `pnpm -r test` + typecheck; commit** `feat(server): region config axis + /health`.

---

### Task 2: Versioned migration system

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (runner + versioned steps)
- Test: `apps/server/src/db/migrate.test.ts`

**Interfaces:**
- Produces: `runMigrations(db)` — creates `schema_version(version INTEGER PRIMARY KEY, applied_at)` if absent, reads the current version, applies each pending migration in a transaction, records it. Migrations are an ordered array `MIGRATIONS: { version: number; up(db): void }[]`. Migration 001 = all existing tables (users incl. base cols, test_runs, profiles, consents, signals, shares, follow_ups) via CREATE TABLE IF NOT EXISTS (so an already-populated DB is a no-op at 001 but gets versioned). Migration 002 = `ALTER TABLE users ADD COLUMN followups_opt_out INTEGER NOT NULL DEFAULT 0` **guarded** (skip if the column already exists — a fresh DB created 001 without it needs it; the current code's users table has it inline, so 001 must NOT include it and 002 adds it, OR 001 includes it and 002 is a no-op guard for legacy DBs). Pick: 001 creates users WITHOUT followups_opt_out; 002 adds it. Idempotent + forward-only.

- [ ] **Step 1: failing test** — `migrate.test.ts`: on a fresh `:memory:` db, `runMigrations` brings `schema_version` to the latest and all tables + the `followups_opt_out` column exist; running it TWICE is a no-op (version unchanged, no throw); simulate a "legacy" db (create the pre-002 users table without the column, set schema_version=1) and assert `runMigrations` applies 002 and adds the column.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** the runner + `MIGRATIONS` (001 base schema, 002 add followups_opt_out with an "column exists?" guard via `PRAGMA table_info(users)`). Keep FK definitions intact. `connection.ts.openDb` still calls `runMigrations`.
- [ ] **Step 4: run + pass; `pnpm -r test` (all existing DB-dependent tests still pass on the migrated schema) + typecheck; commit** `feat(server): versioned forward-only migrations`.

---

### Task 3: Fastify serves the Mini App static

**Files:**
- Modify: `apps/server/package.json` (+`@fastify/static`), `apps/server/src/app.ts` (register static + SPA fallback), `apps/server/src/config.ts` (`miniappDist` path, optional), `apps/server/src/main.ts`
- Test: extend `apps/server/src/app.test.ts`

**Interfaces:**
- Produces: when `config.miniappDist` is set and exists, the app serves it at `/` with `index.html` SPA fallback for non-API GETs; API routes (`/auth`,`/me`,`/submit`,`/assessment`,`/signal`,`/consent`,`/share`,`/followup`,`/webhook`,`/health`) are unaffected. `MINIAPP_DIST` env (default `../miniapp/dist` relative to server, or absolute in the image).

- [ ] **Step 1: failing test** — build a tiny temp dist dir (write an `index.html` fixture), `buildApp({..., miniappDist: tmpDir})`, assert `GET /` returns the index html (200, `text/html`), a `GET /nonexistent-page` (non-API) also returns index html (SPA fallback), and `GET /assessment` STILL returns the assessment JSON (API not shadowed). When `miniappDist` is undefined, `GET /` is 404 (dev/tests).
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** — register `@fastify/static` (root = miniappDist, `wildcard:false`), add a `setNotFoundHandler` (or a `/*` GET) that serves index.html ONLY for GET requests whose path isn't a known API prefix; keep API 404s as JSON. Guard registration on `miniappDist` being provided + existing.
- [ ] **Step 4: run + pass; `pnpm -r test` + typecheck; commit** `feat(server): serve the Mini App SPA from the API origin`.

---

### Task 4 (controller-authored): Container + Caddy + fonts

**Files:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.dockerignore`
- Multi-stage `Dockerfile`: build stage (`node:20`, `pnpm i`, build shared→server→miniapp); runtime stage (`node:20-slim` + `apt-get install -y fonts-noto-core fonts-noto-color-emoji`), copy server `dist` + `node_modules` + `content/` + `apps/miniapp/dist`; `CMD node apps/server/dist/main.js`. Set `MINIAPP_DIST` to the copied dist. resvg uses the image's installed Noto fonts (Cyrillic + emoji) → no tofu.
- `docker-compose.yml`: `app` (env_file `.env`, volume for `./data` sqlite persistence, expose internal port) + `caddy` (ports 80/443, volume for certs, depends_on app).
- `Caddyfile`: `{$DOMAIN} { reverse_proxy app:3000 }` — auto-HTTPS via Let's Encrypt.
- `.dockerignore`: node_modules, .git, .env, data, dist scratch.

### Task 5 (controller-authored): Legal draft pages

**Files:** `apps/miniapp/public/policy.html`, `apps/miniapp/public/offer.html` (RU, 152-ФЗ template, prominent «ЧЕРНОВИК — требует юридической проверки» banner; operator/ИНН/contact placeholders); default `VITE_POLICY_URL=/policy.html`, `VITE_OFFER_URL=/offer.html` in the deploy env. Consent screen already reads these env vars.

### Task 6 (controller-authored): Deploy runbook

**Files:** expand `docs/deploy/yandex-cloud.md` into concrete steps: create VM (ru-central1, Ubuntu, SSD), install Docker, point `DOMAIN` DNS at the VM IP, `.env` (all prod vars incl. `WEBHOOK_SECRET`, `TG_SHARE_BASE_URL`, `MINIAPP_URL=https://DOMAIN`, `PUBLIC_BASE_URL=https://DOMAIN`, `REGION=ru`), `docker compose up -d`, register the bot's Mini App + domain in @BotFather, verify `/health` + webhook + a real /start→Mini App→result→share pass. List the user-only actions clearly (cloud account, domain, BotFather, real legal review).

---

## Self-Review

**Spec coverage:** deploy prereqs from SPEC_CHANGELOG — migrations (Task 2), OG fonts (Task 4), full prod env (Tasks 4/6, `.env.example`), single-origin serving (Task 3), region axis for future global (Task 1), legal pages (Task 5), runbook (Task 6). Payments/multi-region infra explicitly out.

**Placeholder scan:** legal pages and crisis-support copy are content the controller writes concretely (RU, with a review banner); no code-step placeholders. Domain/operator identity are deploy-time env/user inputs, correctly parameterized.

**Type consistency:** `config.region`/`regionConfig` feed `/health` and (future) result crisis-block copy; `runMigrations` keeps the same tables the repos query; `miniappDist` threads config→app→main and matches the Docker copy path.

**Portability check:** no Yandex SDK anywhere; Docker + Caddy + Postgres-ready repos mean a second region (or a non-Yandex host) is a redeploy, not a rewrite — satisfies the "global expansion is another story, not a trap" decision.

---

*Phase 5 makes the MVP deployable and region-portable. After deploy: the "на зуб" content test and the instrumented soft-launch pilot (α/EFA export harness) validate the typology.*
