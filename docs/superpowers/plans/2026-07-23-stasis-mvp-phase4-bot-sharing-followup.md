# Stasis MVP — Phase 4: Bot + Sharing + Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> Final MVP layer. Design spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md` §2, §8, §9, §10, §12.3. Reverse-spec seams: Phase 1–3 endpoints. Also clears the Phase-3 final-review queued items (consent recording, policy URLs, assessment gating).

**Goal:** Turn the playable Mini App into a launchable product: a Telegram bot entry point, viral deep-link sharing with an OG preview image (no PII), a follow-up loop that nudges the user about their step, server-side consent recording, and data deletion.

**Architecture:** grammY bot runs in the SAME Node process as the Fastify backend, via a webhook mounted on Fastify (verified with `secret_token`). Three new tables — `consents`, `shares`, `follow_ups` — each behind a repository. Sharing exposes a public, PII-free payload resolvable by a non-enumerable `slug`; an OG image is rendered SVG→PNG (via `@resvg/resvg-js`) and cached on disk. A lightweight periodic worker scans `follow_ups.due_at` and sends the bot nudge. The Mini App wires its existing share/step/consent hooks to the new endpoints.

**Tech Stack:** grammY, `@resvg/resvg-js`, `nanoid`, existing Fastify + node:sqlite + `@stasis/shared`, Vitest.

## Global Constraints

- TS strict; ESM (`.js` suffixes); pnpm; Vitest; output pristine. All DB access via repositories; `Db` type stays out of routes/bot handlers.
- Client never trusted for identity; bot updates verified via webhook `secret_token`. Secrets from env (`BOT_TOKEN`, `JWT_SECRET`, `DATA_ENC_KEY`, `WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `MINIAPP_URL`).
- **Sharing leaks no PII / no IP:** `shares.public_payload` and the OG image carry only the lead element + a витринное description — NOT wheel scores, weak spheres, resource state, belief/strategy text, or any answers. `slug` = `nanoid(12)`, non-enumerable; share is revocable.
- **Consent must be recorded server-side** before/at data processing: `consents` rows (user_id, kind, doc_version, granted_at). Recorded when the user grants consent, prior to `/submit`.
- **Follow-up:** one nudge per taken step; idempotent (never double-send); respects unsubscribe; stores the committed step encrypted (it's derived from the user's result).
- **Deletion:** `/delete_my_data` bot command hard-deletes the user's `test_runs`/`profiles`/`follow_ups`/`consents`/`shares`, anonymizes `users`.
- No sensitive data logged (answers, scores, belief text, initData, tokens). RU hosting (152-ФЗ) per `docs/deploy/yandex-cloud.md`.
- Live Telegram verification (real webhook/deep-link/OG preview) requires a deployed public HTTPS URL + real bot — out of scope for unit/integration tests; note the gap where relevant.

---

### Task 1: Consent recording (clears Phase-3 queued item)

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (+`consents` table)
- Create: `apps/server/src/db/consents.repo.ts`
- Modify: `apps/server/src/app.ts` (`POST /consent`)
- Modify: `packages/shared/src/schemas.ts` (`ConsentPayloadSchema`)
- Modify: `apps/miniapp/src/api.ts` (`recordConsent`), `apps/miniapp/src/App.tsx` (call it on consent)
- Test: `apps/server/src/app.consent.test.ts`

**Interfaces:**
- Produces: `ConsentPayloadSchema` = `{ docVersion: string; pdn: true; psych: true; age18: true }` (all must be literally `true`); `consentsRepo(db).record(userId, docVersion)` inserts one row per kind (`pdn`,`psych`,`age18`); `POST /consent` (`Bearer`) validates + records, `200 {ok:true}`, `400` if any flag not true, `401` no session. Client `api.recordConsent(payload)`.

- [ ] **Step 1: Add `consents` table** — `migrate.ts` (append):
```ts
db.exec(`CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, doc_version TEXT NOT NULL, granted_at INTEGER NOT NULL
);`);
```

- [ ] **Step 2: `ConsentPayloadSchema` in shared**:
```ts
export const ConsentPayloadSchema = z.object({
  docVersion: z.string().min(1),
  pdn: z.literal(true), psych: z.literal(true), age18: z.literal(true),
});
export type ConsentPayload = z.infer<typeof ConsentPayloadSchema>;
```

- [ ] **Step 3: Write failing test** `app.consent.test.ts` — auth via `/auth`, then `POST /consent` with all-true → 200 and 3 rows in `consents`; with `psych:false` → 400; no token → 401.

- [ ] **Step 4: run + fail.**

- [ ] **Step 5: implement** `consents.repo.ts` (`record(userId, docVersion)` inserts pdn/psych/age18 rows, `Date.now()`), and `POST /consent` in `app.ts` (reuse `readSession`→401; `ConsentPayloadSchema.safeParse`→400; `consentsRepo(db).record`).

- [ ] **Step 6: client** — `api.recordConsent(payload)` (POST `/consent`, Bearer, best-effort-but-surface-error); in `App.tsx`, when the flow leaves consent (consent given), call `api.authed()` then `api.recordConsent({docVersion: CONSENT_DOC_VERSION, pdn:true, psych:true, age18:true})`. Define `CONSENT_DOC_VERSION='2026-07-23'`.

- [ ] **Step 7: run + pass; `pnpm -r test`; typecheck; commit** `feat: server-side consent recording`.

---

### Task 2: Bot foundation (grammY + webhook + /start + /delete_my_data)

**Files:**
- Create: `apps/server/src/bot/bot.ts`, `apps/server/src/bot/webhook.ts`
- Modify: `apps/server/src/app.ts` (mount webhook route), `apps/server/src/main.ts` (set webhook on boot), `apps/server/src/config.ts` (`webhookSecret`, `miniappUrl`, `publicBaseUrl`)
- Create: `apps/server/src/db/deletion.ts` (cross-repo hard delete)
- Test: `apps/server/src/bot/bot.test.ts`, `apps/server/src/db/deletion.test.ts`

**Interfaces:**
- Produces:
  - `buildBot(deps): Bot` — grammY bot with `/start` (replies with an inline keyboard button `web_app` opening `MINIAPP_URL`, honoring a `startapp`/`start` deep-link param passed to context), `/delete_my_data` (calls `deleteUserData` for the sender's tg id, confirms).
  - `webhookHandler(bot, secret)` — Fastify handler that checks header `X-Telegram-Bot-Api-Secret-Token === secret` (else 401) then feeds the update to grammY.
  - `deleteUserData(db, tgUserId): void` — hard-deletes rows across `test_runs`/`profiles`/`follow_ups`/`consents`/`shares` for that user, sets `users.deleted_at`, clears username.

- [ ] **Step 1: failing tests** — `bot.test.ts`: feeding a `/start` update produces a reply containing a `web_app` button with the miniapp URL (use grammY's testing pattern or assert on a mocked `api.sendMessage`); `deletion.test.ts`: seed a user + a test_run + profile + consent, call `deleteUserData`, assert all gone and `users.deleted_at` set.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `deletion.ts` (parameterized deletes in a transaction), `bot.ts`, `webhook.ts`; mount `app.post('/webhook', webhookHandler(bot, cfg.webhookSecret))`; in `main.ts` call `bot.api.setWebhook(`${PUBLIC_BASE_URL}/webhook`, { secret_token })` on boot (guard: only if `PUBLIC_BASE_URL` set). Add config fields.
- [ ] **Step 4: run + pass; `pnpm -r test`; typecheck; commit** `feat(server): grammY bot (/start web_app, /delete_my_data) over verified webhook`.

Note: setting the real webhook needs a public HTTPS URL — `main.ts` skips it when `PUBLIC_BASE_URL` is unset (dev). Live verification deferred to deploy.

---

### Task 3: Sharing — shares table + slug + public payload + resolve

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (+`shares`), create `apps/server/src/db/shares.repo.ts`
- Create: `apps/server/src/share/payload.ts` (build public payload from a profile — PII-free)
- Modify: `apps/server/src/app.ts` (`POST /share`, `GET /share/:slug`)
- Modify: `packages/shared/src/schemas.ts` (`SharePublicPayloadSchema`)
- Add dep: `nanoid`.
- Test: `apps/server/src/app.share.test.ts`

**Interfaces:**
- Produces:
  - `SharePublicPayload = { leadElement: Element; headline: string; blurb: string }` (NO scores/spheres/answers/belief text).
  - `sharesRepo(db)` → `create(profileId, userId, payload): { slug }` (slug `nanoid(12)`), `getBySlug(slug): { public_payload } | undefined` (excludes revoked), `revoke(slug, userId)`.
  - `buildSharePayload(profile, content): SharePublicPayload` — leadElement + a витринное description from a small `shareCopy[element]` table (NOT the belief matrix).
  - `POST /share` (`Bearer`, body `{ profileId }`) → `{ slug, url: `${PUBLIC_BASE_URL}?startapp=${slug}` }` after verifying the profile belongs to the user; `GET /share/:slug` (public) → the public payload or 404.

- [ ] **Step 1: failing test** `app.share.test.ts` — submit to get a profileId, `POST /share {profileId}` → slug; `GET /share/:slug` returns `{leadElement, headline, blurb}` and the JSON contains NONE of: wheel numbers, weak-area names, resource state, or a known belief phrase (real leak check); `POST /share` for someone else's profileId → 403/404; unknown slug → 404.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `shares` table, `shares.repo.ts`, `payload.ts` (+ a 4-entry `shareCopy` const, RU, витринное — reviewed as non-sensitive), routes. `slug` non-enumerable via nanoid.
- [ ] **Step 4: run + pass; `pnpm -r test`; typecheck; commit** `feat(server): PII-free share payload + slug resolve`.

---

### Task 4: OG image for shares

**Files:**
- Create: `apps/server/src/share/og-image.ts`
- Modify: `apps/server/src/app.ts` (`GET /share/:slug/image.png`)
- Add dep: `@resvg/resvg-js`.
- Test: `apps/server/src/share/og-image.test.ts`

**Interfaces:**
- Produces: `renderOgSvg(payload: SharePublicPayload): string` (an SVG string, element-accent themed, headline text, NO sensitive data); `svgToPng(svg): Buffer` (via resvg); `GET /share/:slug/image.png` returns `image/png` (resolve slug → payload → svg → png), cached in-memory/disk keyed by slug; 404 for unknown slug.

- [ ] **Step 1: failing test** `og-image.test.ts` — `renderOgSvg(payload)` returns an SVG containing the headline and the element accent, and NOT any sensitive field; `svgToPng` returns a non-empty Buffer starting with the PNG magic bytes (`\x89PNG`).
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `og-image.ts` (hand-built SVG template + resvg render); the route (cache by slug; generation off the request hot path is a later optimization — for MVP render lazily + cache). No sensitive content on the card.
- [ ] **Step 4: run + pass; `pnpm -r test`; typecheck; commit** `feat(server): OG share image (SVG->PNG, cached, PII-free)`.

---

### Task 5: Follow-up loop

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (+`follow_ups`), create `apps/server/src/db/followups.repo.ts`
- Create: `apps/server/src/followup/scheduler.ts`
- Modify: `apps/server/src/app.ts` (`POST /followup`, `POST /followup/unsubscribe`), `apps/server/src/main.ts` (start scheduler)
- Modify: `apps/miniapp/src/api.ts` (`takeStep`), result screen wiring is Task 6.
- Test: `apps/server/src/followup.test.ts`

**Interfaces:**
- Produces:
  - `followUpsRepo(db, encKey)` → `schedule(userId, cardRef, stepText, dueAt)` (stepText encrypted), `due(now): Row[]`, `markSent(id)`, `unsubscribe(userId)`, `recordReply(id, reply)`.
  - `runDueFollowUps(db, encKey, bot, now)` — sends the bot nudge («Как прошёл шаг „…"?» with inline reply options) for each due, idempotent (`markSent`), skips unsubscribed. Returns count.
  - `startScheduler(db, encKey, bot)` — a periodic tick (interval, e.g. 5 min) calling `runDueFollowUps`. Guarded off when no bot/PUBLIC_BASE_URL.
  - `POST /followup` (`Bearer`, `{ cardRef, stepText }`) schedules `dueAt = now + 3d`; `POST /followup/unsubscribe` (`Bearer`).

- [ ] **Step 1: failing test** `followup.test.ts` — `schedule` then `due(now+3d)` returns it (and `due(now)` doesn't); `runDueFollowUps` with a mocked bot `sendMessage` sends once and `markSent` so a second run sends nothing (idempotent); `unsubscribe` then schedule → not sent; stepText stored encrypted (ciphertext, not plaintext). `POST /followup` 401 without token.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** table/repo/scheduler/routes; `main.ts` calls `startScheduler` only when a bot exists. Reuse `encryptField`.
- [ ] **Step 4: run + pass; `pnpm -r test`; typecheck; commit** `feat(server): follow-up scheduling + idempotent nudge`.

---

### Task 6: Mini App wiring + Phase-3 queued polish

**Files:**
- Modify: `apps/miniapp/src/App.tsx` (share → real deep-link; take-step → `/followup`; gate flow on assessment-loaded), `apps/miniapp/src/screens/ResultScreen.tsx` / `BeliefCard.tsx` (surface "взять шаг в работу"), `apps/miniapp/src/screens/Consent.tsx` (real Политика/Оферта URLs from config)
- Modify: `apps/miniapp/src/api.ts` (`createShare(profileId)`, `takeStep(cardRef, stepText)`)
- Test: `apps/miniapp/src/App.test.tsx` (extend), `screens/result.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 1–5 endpoints. Produces: working share (calls `POST /share`, then Telegram `shareURL`/`switchInlineQuery` with the returned `url`), a "взять шаг в работу" action on a belief card → `POST /followup`, flow gated so the user can't pass Intro until `assessment` is loaded (removes the dead-end fully), and real policy links (`VITE_POLICY_URL`/`VITE_OFFER_URL`, placeholders documented).

- [ ] **Step 1: failing tests** — extend App smoke: after result, clicking share calls `api.createShare` then attempts native share with the returned url; clicking "взять шаг" on a card calls `api.takeStep(cardRef, stepText)`. Consent screen renders non-`#` policy links when the env is set. Flow can't reach `wheel` while `assessment` is null (Intro's continue disabled or a loading gate).
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** the api methods + wiring; replace the Phase-4 `onShare` TODO stub with the real create-then-share; add the take-step control to `BeliefCard` (calls a passed `onTakeStep(card)`); gate the flow on assessment; wire policy URLs.
- [ ] **Step 4: run + pass; `pnpm -r test`; typecheck; `pnpm --filter @stasis/miniapp build`.**
- [ ] **Step 5: verify-before-done** — run server + miniapp dev; drive one pass; confirm a share create returns a url and a taken step schedules a follow-up (via a DB check or log). Note the live-Telegram gap (webhook/preview) for deploy. Commit `feat: wire share, take-step, policy links, assessment gate`.

---

## Self-Review

**Spec coverage:** bot entry + web_app button §2/§9 (Task 2) · consent recording §10 (Task 1) · sharing deep-link + PII-free public payload §8/§12 (Task 3) · OG image §9 (Task 4) · follow-up loop §2/§12.2 (Task 5) · deletion §9 (Task 2) · Phase-3 queued (consent, policy URLs, assessment gate) (Tasks 1, 6). Payments/subscriptions (Telegram Stars) are Slой-роста, NOT MVP — excluded.

**Placeholder scan:** `shareCopy`, `og-image` template, and crisis/policy copy are content the implementer writes concretely (RU, reviewed non-sensitive); no code-step placeholders. Live-Telegram verification gaps are explicitly noted, not hidden.

**Type consistency:** `SharePublicPayload` (shared) is produced by `buildSharePayload`, stored in `shares`, consumed by `og-image` and `GET /share/:slug`; `ConsentPayload` shared between client `recordConsent` and `POST /consent`; follow-up `cardRef` shape (`{element,area}`) matches `beliefCardIds`. Bot/webhook/scheduler are guarded off when `PUBLIC_BASE_URL`/bot absent so dev + tests don't require a live Telegram.

**Security note:** every new endpoint that touches user data is `Bearer`-guarded and re-derives `userId` from the session; the only public routes are `GET /share/:slug` and its image (PII-free by construction, verified by a leak test). Webhook is `secret_token`-verified.

---

*Phase 4 completes the Solo MVP: a launchable Telegram bot + Mini App with viral sharing, follow-up, consent, and deletion. Post-Phase-4: deploy (RU/Yandex Cloud), the instrumented soft-launch pilot, and the "на зуб" content test.*
