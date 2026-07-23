# SPEC_CHANGELOG

Short records of where the built code intentionally deviates from the written spec, and why. Spec = source of truth; every drift is reconciled here (Spec-First v2 §4). Newest first.

Reference spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md`.

---

## 2026-07-23 — Pilot reframed as instrumented soft-launch

- **The app IS the pilot.** Decision: don't run a separate pilot — the launched MVP collects the data. But instrumented, not vibes-only. Split the two signal types explicitly: (a) product signals in-app (это-не-про-меня, 1-tap «точно про меня / общо» anti-Barnum, share-rate, drop-off, follow-up reply) drive continuous product iteration; (b) psychometric validity is a single statistical pass (α/EFA/discriminant) at ~150–200 responses on the pseudonymized `/submit` answers — the only thing that proves the typology holds; positive feedback cannot substitute for it. Claims stay probabilistic until that pass. Updated spec §2 (result), §12.2; `docs/spec-first/track-map.md`. Implementation requirement added to Ф3/Ф4: capture product signals (no PII) + a small export/analysis harness.

## 2026-07-23 — Persistence + `POST /submit` (Phase 2, Task 6)

- **`ENGINE_VERSION = '2.0.0'` introduced** as a literal constant in `apps/server/src/db/runs.repo.ts`, stamped onto every `profiles` row alongside `content_version`. Not previously named in the spec; recorded here per the brief's own drift note. No other behavior drift: crypto (AES-256-GCM, `iv:tag:ciphertext` hex encoding), the `test_runs`/`profiles` schema, `runsRepo.saveRun`, and the `/submit` contract (`200 {profileId, result}` / `400` bad body / `401` bad session) all match the brief's code as written.
- **`app.submit.test.ts`'s `sign(...)` fixture needed `signature: 'test-signature'`**, which the brief's Step 7 snippet omitted (it only set `auth_date`). Without it, `parse()` (inside `verifyInitData`) throws on a validly-HMAC-signed initData that's missing the `signature` field — the same gotcha already documented in Phase 1's `app.test.ts`. Adapted the submit test's fixture to match the established camelCase-`user`/top-level-`signature` pattern; no production code changed.
- **`runs.repo.ts`'s `saveRun` typed `profile` as `ReturnType<typeof computeProfile>`** instead of the brief's `profile: any`, to keep the file strict-mode-clean without an explicit `any`. Same field access, same behavior.
- **`/submit` `result` interpretation (contract §E "rendered from content by ref"):** the server returns the raw `computeProfile()` output (refs/ids/enums, no text), and the CLIENT renders human-facing text from the content bundle by those refs. Chosen because §D already says the engine returns refs, never text, and keeping rendering client-side avoids duplicating the content bundle server-side in the response. Phase 3 (Mini App) owns rendering.
- **Review follow-up fixes (Task 6):** (a) `profiles.is_strategy_mixed` column added + persisted — `computeProfile` returned it but `saveRun` silently dropped it, losing it on reload. (b) `DATA_ENC_KEY` now hex-length-validated in `loadConfig()` (fail fast at startup, not on first `/submit`). (c) `/submit` now re-checks user liveness via `users.getById` and 401s on an orphaned/soft-deleted user, for parity with `/me` (prevents a still-valid JWT persisting rows post-deletion).

## 2026-07-23 — Content loader (Phase 2, Task 3)

- **`content/matrix/strategies.yaml`: 32 `howTo` bullets wrapped in double quotes.** Each `interactionGuides[].howTo` entry using the `Заголовок: пояснение` lead-in style contained an unquoted `: ` (colon+space) inside a plain YAML scalar, which is invalid per the YAML block-scalar grammar — `js-yaml` (and any spec-compliant parser) parses it as a single-key mapping (`{ "Заголовок": "пояснение" }`) instead of the intended string, failing `InteractionGuideSchema`'s `howTo: z.array(z.string())`. Fixed by quoting the 32 affected lines (text content unchanged, byte-identical apart from the added `"..."`); the 16 bullets with no internal colon were already valid and untouched. Caught by `apps/server/src/content/loader.test.ts` loading the real bundle.
- **Review follow-up fixes:** the word-start lookbehind (below) over-corrected — it missed fused Russian compounds (психотерапия, самолечение, психодиагностика). Replaced with a targeted benign-word strip (`/увлеч\p{L}*/`) + naive root scan, so compounds are caught again while «увлечение» clears (regression test added). Also moved the file-read/YAML-parse calls INSIDE `loadContent`'s try so ENOENT / YAML syntax errors surface as `ContentError` per contract; and extended the lexicon `walk` to cover `strategyTest`, `elementItems`, `resourceItems`. **Deferred (Minor):** `ContentBundle.strategyTest` drops the YAML `scale` block (scoring hardcodes 1–6, doesn't consume it) — revisit if scoring needs content-driven scale.
- **Forbidden-lexicon regex tightened with a word-start lookbehind** (`apps/server/src/content/loader.ts`, `FORBIDDEN`). The brief's naive alternation `/(...|лечени|...)/i` false-positive-matched the benign word «увлечение» (hobby/passion) — `у-в-Л-Е-Ч-Е-Н-И-е` contains "лечени" as a mid-word substring — which appears in `sphereInsights.hobby.observation` and the `matrix.earth.hobby` card. Neither use has any medical/diagnostic meaning. Changed to `(?<![\p{L}])(?:root1|root2|...)` (unicode-aware, case-insensitive) so roots must start at a word boundary; this still catches the injected-violation test (`'это диагноз для тебя'`) and any genuine standalone occurrence of the forbidden roots, it just no longer fires on unrelated words that happen to contain the same letters mid-word. Not a loosening of intent — a precision fix to the pattern itself.

## 2026-07-23 — Phase 1 (Foundation) reconciliation

Retroactive entries for drift that occurred while building Phase 1 (spec written for `better-sqlite3`; reality differs). Reverse-spec of what was actually built: `docs/spec-first/phase1-reverse-spec.md`.

- **DB driver: `better-sqlite3` → Node built-in `node:sqlite` (`DatabaseSync`).** Reason: `better-sqlite3`'s native build fails on this machine (node-gyp vs installed VS toolchain). `node:sqlite` needs no native build. Loaded via `createRequire(import.meta.url)` because Vitest/Vite strips the `node:` prefix and can't resolve bare `sqlite`. PRAGMA calls use `db.exec('PRAGMA ...')` (node:sqlite has no `.pragma()` helper). Repository layer + `Db` type abstraction preserved, so Postgres portability is unaffected. Spec §7/§9 to be updated to name `node:sqlite`.
- **JWT hardened beyond spec:** algorithm pinned to `HS256` on both `sign` and `verify` (`algorithms: ['HS256']`), and the decoded payload shape is re-validated (numeric `uid`) before trust. Defense-in-depth vs alg-confusion; spec only said "server JWT".
- **`users` upsert preserves fields:** `ON CONFLICT DO UPDATE` uses `COALESCE(excluded.x, users.x)` so a partial re-auth (missing username/lang) doesn't null existing values. Not specified; correctness fix.
- **`/me` routes through `usersRepo.getById(id)` (added) with `deleted_at IS NULL` filter;** returns 401 on a valid token whose user row is absent/soft-deleted. Final-review must-fix (raw query in the route violated "all DB access via repository"). Closes the soft-delete gap early.
- **`initData` validation wraps both `validate()` and `parse()`** in one `InitDataError` boundary (library errors can't leak past the typed contract).

## 2026-07-23 — Strategies axis reinstated into MVP

- **Ось «Стратегии поведения» вернулась из «Слоя роста» в Solo MVP** as a full third axis (partner decision, reversing the ред. 4 deferral). Added: strategy sub-test (16 items, stress-operationalized), result block, and 16 communication guides. Spec updated (§2/§3.4/§4/§5/§8); content in `content/matrix/strategies.yaml`. `SubmitPayload` gained `strategyAnswers`. Rationale: strategies are the relational value (bridge to Family/Business) and are conceptually orthogonal to elements; the collinearity risk is a measurement-wording concern handled by operationalization + the pilot's discriminant-validity check.

## Known Phase-2 blockers (fix before building on top)

- `@stasis/shared` `package.json` `main`/`types` point at `./src/index.ts` (TS source). Fine while nothing imports it built, but the first `tsc` build that consumes `@stasis/shared` will break. Add a build step / point at `dist` in Phase 2.
