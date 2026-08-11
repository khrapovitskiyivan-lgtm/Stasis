# Return Loop (Companion Step 1) — Design

**Date:** 2026-07-26
**Status:** Design approved (brainstorm), pending implementation plan
**Scope:** `apps/server` (engine + DB + followup/scheduler + bot) and `apps/miniapp`. Built on the CURRENT onboarding — does NOT redesign onboarding.

## Context

Strategic pivot (recorded in project memory): Stasis moves from a one-time diagnostic to an ongoing supportive companion. A one-time diagnostic has ~0 retention; the category's economics live in the return. Audience model = land-and-expand (entrepreneur wedge → later family/company), sequenced: **prove week-2 return on the entrepreneur first**.

Evidence base (VoC + two specialist consults this session):
- **Memory is the killer feature.** Users abandon products that "don't remember them" (Replika); they love products that reference their past (Rosebud). Referencing the user's own prior belief + step is the differentiator.
- **Value = movement, not a log.** The check-in must ask about the *step*, not "how's your mood" — "data without direction" is the class-wide churn driver.
- **Digest = synthesis + a next step, not a graph.**
- **Forgiving, non-nagging loop.** No streaks, no guilt, inviting tone (notification-fatigue is the #2 churn driver).
- **Entrepreneur angle:** a private, non-judging companion is the emotional return trigger (founder loneliness / "can't show weakness").

**Single success metric:** does the user come back for a check-in in week 2.

## The loop

```
[periodic nudge] → [light, memory-anchored check-in] → [synthesis digest]
```

Cadence every 1–2 weeks (start with 14 days). Tone inviting, never scolding. No streaks/guilt. Opt-out already exists (`users.followups_opt_out`) and is reused.

## 1. Check-in content (~1 min, NO typology)

1. **Memory-anchored step question (first, always):** recall the user's last belief + step verbatim — "In the past, your stuck sphere was **[X]**, your step was *«[step]»* (criterion: [done]). What happened?" → `done | partial | missed | changed`, plus an optional one-line "what got in the way". This closes the "it doesn't remember me" pain and keeps the product a mover, not a mood tracker.
2. **Wheel re-rate (6 taps):** a full `WheelScores` (all 6 spheres, 1–10) for sphere drift. Must collect all 6 (the schema requires it) — reuses the existing `Wheel` component.
3. **1-tap energy/resource check:** for the state trend and the safety gate.

No element/strategy questions.

## 2. Synthesis digest ("твоя динамика")

A short, observational read — "here's what I noticed" — plus ONE next micro-step. Not a graph; no clinical language; no scoring-as-verdict.

**Deterministic selection, varied wording.** Per the CLAUDE.md rule ("non-determinism only in wording, not in selection"): a pure engine function chooses *what* to say (ids + numbers); a separate wording layer renders varied phrasing. The selection is golden-testable.

Observations, prioritized (show top 2–3):
1. **Step outcome — always** (the core action loop): "step done" / "step stalled — what's in the way?". No guilt.
2. **Most notable sphere movement** (|delta| ≥ threshold, e.g. ≥ 2 of 10): up → acknowledge; down → gently flag.
3. **Recurring pattern** (from the 3rd check-in on): "second time in a row the stuck point circles **[sphere/theme]**" — the memory/synthesis magic.
4. **Energy trend** — soft; if dropping, switch to the gentle/safety tone.

**+ ONE next micro-step (direction, not data):**
- step **done** → a next step (continue/progress the same belief, or from the current weakest sphere via `sphereInsights[area]`);
- step **not done** → offer to keep or **shrink** it ("make it even smaller?") — forgiving, no pressure.

**Cold-start / graceful degradation.** The 1st re-check-in already has 2 data points (onboarding + check-in) → step outcome + one sphere delta are computable; "recurring pattern" activates from the 3rd point. Fewer observations early, richer later. If no prior step exists, the memory question and digest fall back to wheel drift + one new step.

**Safety route.** If `resourceState === 'critical'` (reuse `scoreResource`), the digest routes to the support/safety block, NOT a chipper "dynamics" message; the "no upsell on distress" rule holds.

**Belief handling (MVP-minimal — full redesign is Spec #2).** The check-in references the *existing* stored belief + step; the digest's "next step" continues/shrinks it or falls back to `sphereInsights[area]` (which covers all 6 spheres, including `rest`). No new belief-selection flow here.

## 3. Data / architecture

Reuse-first. Everything below reuses existing infra unless marked new.

**One scheduling substrate (no second scheduler).** The check-in nudge and the step nudge are the same primitive ("at time T send an inline-keyboard message and record the response"). Do NOT add `users.next_checkin_at`. Model the scheduled check-in as a nudge row on the `follow_ups` pattern — add a `kind` discriminator (`'step' | 'checkin'`) to the existing table, or a generic `scheduled_nudges` table — reusing the existing `due()` / `markSent()` / `unsubscribe()` / opt-out logic (already tested). The next `due_at` is set when a check-in completes or is skipped.

**New table `checkins` (data-capture only):**
- `user_id` (plaintext, indexed), `created_at` (plaintext), `wheel_scores` (encrypted), `energy` (encrypted), `step_ref` (nullable id of the step this reflects — **NOT a hard FK**; store the outcome inline), `step_outcome` (plaintext enum `done|partial|missed|changed`), `note` (encrypted).
- Written when the user completes a check-in in the Mini App. Grows unboundedly → needs `INDEX(user_id)`.

**Encryption** (`field.ts` = AES-256-GCM, random IV → encrypted columns are NOT SQL-filterable/aggregatable):
- Encrypt `wheel_scores`, `energy`, `note` (psych-state data, 152-ФЗ; consistent with `test_runs` encrypting `wheel`).
- `step_outcome` and all timestamps stay **plaintext** (low-sensitivity enum + needed for the metric).
- The digest reads a user's rows, decrypts in JS, and passes clean arrays to the pure function — aggregation in memory, not SQL.
- **The week-2 return metric is computed from timestamps only** (`created_at` + `user_id`, both plaintext) — never from encrypted content.

**Deletion (152-ФЗ) — the sharpest gotcha in this codebase.** `deletion.ts` is a hand-ordered hardcoded `CHILD_TABLES` list with `foreign_keys=ON`.
- Add `'checkins'` (and any new nudge table) to `CHILD_TABLES` **before** `'follow_ups'` (FK/order: adding after would roll the whole delete back and silently break `/delete_my_data`).
- **Add a guard test** that enumerates from `sqlite_master` every table with a `user_id` column and asserts each is in `CHILD_TABLES` — turning a silent PDn leak into a failing test. This ships WITH the feature.

**Scheduler hardening (minimal).** Current `setInterval` (5 min) can double-send if a batch outlives a tick (no re-entrancy guard) — the check-in load thickens the batch.
- Add a module-level `running` bool that skips a tick while the previous is in flight.
- Add `INDEX(user_id)` on `checkins` and a partial `INDEX(due_at) WHERE sent_at IS NULL` on the nudge table.
- Do **not** build row-claim/locking (single synchronous process). Timezones deferred — at a weekly cadence, send on the tick; hour-of-day doesn't matter.

**Digest engine.** `computeDigest(history, now)` in `engine/`, pure/deterministic (no DB/time/random), golden-tested like `scoring.ts`. `now` is a parameter (never `Date.now()` inside — matches `runDueFollowUps(..., now)`). Returns ids + numbers (`{ observations: [{kind, area, delta}], nextStep }`); the varied-wording layer is separate (like `render.ts`), outside the golden core. New user-facing digest/check-in copy runs through the forbidden-lexicon validator (диагноз/лечени/терапи/гаранти).

**Migration.** Forward-only append to `MIGRATIONS[]` (new version): new `checkins` table via `CREATE TABLE IF NOT EXISTS`; the `kind` column (if extending `follow_ups`) via the existing `ALTER` idiom.

## Scope

**In:** the nudge substrate change, `checkins` table + repo, `computeDigest` engine function + wording layer, the Mini App check-in flow + digest screen, the deletion guard test, scheduler re-entrancy guard + indexes, one migration.

**Out (explicit):** onboarding redesign / belief-elicitation without element (→ **Spec #2**); the full emergent tone-lens; timezone-aware "morning" timing; payments/subscription; any typology change.

## Testing

- **Engine golden tests** (`engine/*.test.ts`): `computeDigest` — step-outcome always present; sphere-delta threshold; recurring-pattern from 3rd point; cold-start (1st check-in) degradation; `critical` → safety route; deterministic selection (fixed `now`).
- **Repo tests**: `checkins` write/read round-trip through real `node:sqlite` with encryption (like `runs.repo.test.ts`); nudge `due/markSent/opt-out` for `kind='checkin'`.
- **Deletion guard test**: enumerate `sqlite_master` tables with `user_id`, assert each in `CHILD_TABLES`; and a `/delete_my_data` test that seeds a `checkins` row and confirms it's removed without FK rollback.
- **Scheduler**: a test that a long/overlapping tick does not double-send (re-entrancy guard).
- **Metric**: week-2 return derived from timestamps only.
- **Copy**: new digest/check-in strings pass the forbidden-lexicon gate; no clinical language.

## SPEC_CHANGELOG

Log: added the return loop — a periodic memory-anchored check-in (step outcome + wheel re-rate + 1-tap energy) + a deterministic synthesis digest ("your dynamics", observation + one next step), reusing the follow-up nudge substrate; new `checkins` table (wheel/energy/note encrypted, `step_outcome` plaintext), added to `CHILD_TABLES` before `follow_ups` with a table-coverage guard test; scheduler re-entrancy guard + indexes; digest is a pure `computeDigest(history, now)` with a separate wording layer, forbidden-lexicon gated, safety-routed on `critical`. Success metric = week-2 return (timestamp-based). Belief-selection-without-element and onboarding simplification deferred to Spec #2.

## Tunable / open

- Cadence (start 14 days), sphere-delta threshold (start ≥2/10), digest wording — calibrate on the pilot.
- Week-2 return metric: exact definition (a completed check-in in days 8–21 after onboarding).
- Whether to extend `follow_ups` with `kind` vs a new `scheduled_nudges` table — decide in the plan (both satisfy the "one substrate" rule).
