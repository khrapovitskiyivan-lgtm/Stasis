# SPEC_CHANGELOG

Short records of where the built code intentionally deviates from the written spec, and why. Spec = source of truth; every drift is reconciled here (Spec-First v2 §4). Newest first.

Reference spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md`.

---

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
