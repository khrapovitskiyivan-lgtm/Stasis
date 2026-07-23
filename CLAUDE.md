# Stasis — CLAUDE.md

Telegram Mini App helping entrepreneurs surface limiting beliefs. Methodology: **Spec-First v2** (`Documents/CLAUD/Spec-First_Methodology_v2.md`). This file ≤120 lines; deep docs live under `docs/`.

## Stack

- **Mini App:** React + TypeScript + Vite (Phase 3).
- **Server:** Node ≥20, TypeScript (strict, ESM), Fastify 4, grammY (Phase 4). One process (bot + backend), webhook.
- **DB:** Node built-in `node:sqlite` (`DatabaseSync`) — NOT better-sqlite3 (native build fails here). Loaded via `createRequire(import.meta.url)` so Vitest/Vite doesn't choke on the `node:` prefix. PRAGMA via `db.exec(...)`, WAL + busy_timeout. All access through a repository layer (Postgres portability).
- **Contract:** `packages/shared` zod schemas = single client↔server source of truth.
- **Monorepo:** pnpm workspaces (`apps/*`, `packages/*`). pnpm installed via `npm i -g pnpm` (corepack needs admin here).
- **Tests:** Vitest. **Content:** YAML in `content/matrix/`.

## Structure

```
apps/server      Fastify + grammY + node:sqlite + engine + DB (IP lives here)
apps/miniapp     React UI (Phase 3)
packages/shared  zod schemas + TS types (the contract)
content/matrix   flagship-cards.yaml, strategies.yaml, sphereInsights
docs/            specs, plans, spec-first/ (track-map, adapter, reverse-spec, contracts)
```

## Conventions

- ESM everywhere; import siblings with explicit `.js` extension.
- Never trust the client for identity or computed results — server recomputes. Client sends only raw answers + `initData`.
- Engine = pure deterministic functions (no DB/time/random) + golden tests. "Non-determinism" is only in result *wording*, never in card selection.
- Secrets from env only (`BOT_TOKEN`, `JWT_SECRET`); `.env` git-ignored.
- Content matrix is a versioned deploy artifact separate from code; recommendation fields (trigger/action/minThreshold/doneCriterion) are separate so a validator rejects "lozung" advice.

## Track map (Spec-First v2 §1) — see docs/spec-first/track-map.md

- **Spec-track** (spec fully, then build): auth (done), Mini App UI, wheel→belief→step engine, content delivery, sharing, follow-up, consents/legal.
- **Spike-track** (resolve uncertainty first, spec by fact): typology psychometrics (do 4 elements factor as 4? strategy discriminant validity?) — resolved by the pilot; content resonance — resolved by the "на зуб" test. **Do not harden the typology spec until the spike answers.** Plan Б: elements may collapse to 2 axes.

## Model routing by task class (v2 §7)

Heavy reasoning (architecture, security, tricky bugs, final review) → top tier. Routine (UI, forms, reviews) → mid tier. Bulk mechanics (scaffolding, renames) → cheapest tier.

## Legal / safety must-haves (RU-first, 152-ФЗ)

Two explicit consents (PD + psychological state) + 18+ before the test; "not diagnosis / not therapy" disclaimer on entry and result; forbidden lexicon (диагноз/лечение/терапия/гарантия) blocked in content; mandatory safety block with support resources when resourcefulness is critical; no upsell on distress markers; hosting/DB in RU.

## Antipatterns (do not)

- Build on the default branch without branching first.
- Let the client compute the profile / weak sphere / card selection.
- Copy validated scale items verbatim (MBI/PHQ) — write our own by domain.
- Add strategy items that read as cognitive/work style (leaks into elements axis).
- Ship typological claims stronger than the pilot supports.
- Silent scope caps — log what was dropped.

## Living spec (v2 §4)

Spec is the source of truth; drift = a bug in spec OR code. After building, the implementer updates the spec; QA runs a drift-check (spec↔code contracts). Log every deviation in `SPEC_CHANGELOG.md`.

## Docs

Concept: `CONCEPT.md` (ред. 6). Spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md`. Plans: `docs/superpowers/plans/`. Reviews: `EXPERT-REVIEW.md`. Spec-First artifacts: `docs/spec-first/`.
