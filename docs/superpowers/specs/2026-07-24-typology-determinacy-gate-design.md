# Typology Determinacy Gate — Design

**Date:** 2026-07-24
**Status:** Design approved (brainstorm), pending implementation plan
**Track:** Spike-track (typology) — this change *reduces* over-claiming; it does not harden the typology spec.

## Problem

Focus-group feedback (two testers, both entrepreneurs) reported the typology result
"missing":

- Tester 1 (Ivan): the test assigned strategy **власть (power)**; he identifies as
  **уклонение (avoidance)**. He notes his strategy profile is "not pronounced."
- Tester 2 (partner): the test read him as element **Вода (water)**; he says "я далеко
  не вода," and that yielding for him is a *mature/efficiency* choice, not a Water
  disposition.

Yardstick for "accuracy" (agreed): **self-recognition** — the person recognizes
themselves and close others agree. Statistical validity (factor structure,
discriminant validity) is a separate, pilot-only question (~150–200 respondents) and
is explicitly out of scope here.

## Root cause (evidence in code)

Both axes are ranked by the same function `rank()` in
`apps/server/src/engine/scoring.ts`:

```
const ordered = [...keys].sort((a, b) => scores[b] - scores[a]);
const lead = ordered[0], second = ordered[1];
return { lead, second, isMixed: scores[lead] - scores[second] <= MIXED_GAP };
```

Two flaws:

1. **A single "lead" is always emitted**, even when the profile is flat or low. The
   `isMixed` flag is computed but ignored when choosing the lead.
2. **Ties/near-ties break by array order.** `STRATEGIES = ['power','attention','superiority','avoidance']`
   and `ELEMENTS = ['fire','water','air','earth']` (`packages/shared/src/schemas.ts`).
   `Array.prototype.sort` is stable, so equal scores keep list order → **power wins any
   strategy tie; avoidance (last) loses every tie.** This directly produces Ivan's
   "power instead of avoidance" on a flat profile, and the same mechanism can mislabel
   the element axis.

The result therefore **pretends to be confident when the data are not**, with a
systematic bias toward the first-listed type.

## Design

### 1. Determinacy model (approved)

`rank()` yields one of three outcomes per axis, on the 1–6 mean scale (midpoint 3.5):

| Outcome | Condition | Meaning |
|---|---|---|
| `confident` | lead ≥ **floor** AND (lead − second) > **gap** | one clear type |
| `mixed` | lead ≥ floor AND (lead − second) ≤ gap | top-2, close |
| `none` | lead < floor | nothing endorsed (flat/low profile) |

**Thresholds (tunable, calibrate on focus group):**
- `floor = 3.5` — the lead must be *above the scale midpoint*, i.e. the person actually
  endorses that pattern rather than merely being "least-low." This is the fix for the
  flat-profile bias.
- `gap = 0.5` — already present as `MIXED_GAP`; we start *using* it to select the lead
  rather than ignoring it.

The rule is **shared by both axes** (elements + strategies). Thresholds may later be
split per-axis if calibration requires; start shared.

This does not add any new confident claim — it only *withholds* a claim when
unsupported. That is consistent with the spike-track instruction not to harden the
typology before the pilot.

### 2. Data shape (`RenderedResult`, the zod contract)

`packages/shared/src/schemas.ts`:

- **Elements:** replace `isMixed: boolean` with `elementState: 'confident' | 'mixed' | 'none'`.
  `leadElement` / `secondElement` already carry the top-2.
- **Strategy:** `strategy: { state, lead, second, guides }` — add
  `state: 'confident' | 'mixed' | 'none'` and `second: StrategyProfile | null`.
  `guides` stay keyed to the lead strategy (scope bound).

`leadElement`/`secondElement` and `strategy.lead`/`strategy.second` **always carry the
top-2 types by score**, in every state — `state` governs only how they are framed. So
`none` still names the two closest (as weak tendencies); `second` is null only when a
axis has fewer than two scored types (not expected in normal flow).

Both sides follow the contract: server `render` fills the new fields; client reads them.

### 3. Screen mapping (`apps/miniapp/src/screens/ResultScreen.tsx`)

| State | «Стихия» block | «Стратегия» block |
|---|---|---|
| `confident` | "Твоя стихия — X." + strength copy (unchanged) | full profile X + guides (unchanged) |
| `mixed` | "Смешанный профиль: X и Y" — both briefly, no single "твоя стихия" | "Ведущая — X с оттенком Y" + profile X + one line on Y; guides by X |
| `none` | "Ярко выраженной стихии не проявилось — ближе всего X и Y, но некрепко. Это нормально." | "Под стрессом выраженной стратегии не проявилось" + name the two closest softly; **no** full profile, **no** guides |

### 4. Copy location

State-framing strings (`mixed` / `none`) live as **UI constants in `ResultScreen.tsx`**,
consistent with the existing `ELEMENT_STRENGTH_COPY` / `RESOURCE_STATE_COPY` /
`SAFETY_TEXT` pattern. **Content YAML is not touched.** Strategy/element profile bodies
still come from `content/matrix/strategies.yaml`.

## Scope

**Touched:** `packages/shared/src/schemas.ts` (contract), `apps/server/src/engine/scoring.ts`
+ the render step that builds `RenderedResult`, `apps/miniapp/src/screens/ResultScreen.tsx`
(+ copy constants), and the affected tests/fixtures.

**Not touched:** content YAML pipeline, DB/repositories, sharing, follow-up, the wheel,
consent/legal.

## Testing

- **Engine golden tests** (`scoring.test.ts`, `engine/index.test.ts`, `engine/render.test.ts`):
  per axis — clear lead → `confident`; close top-2 (gap ≤ 0.5) → `mixed`; flat/low
  (lead < 3.5) → `none`. Include a regression case reproducing "flat strategy profile no
  longer defaults to power."
- **UI tests** (`apps/miniapp/src/screens/result.test.tsx`): the three branches per axis;
  assert `none` hides the full profile and guides and shows the honest message.
- **Contract**: update `RenderedResult` fixtures across server + client tests.

## SPEC_CHANGELOG

Log: determinacy gate on both typology axes (elements, strategies); `isMixed` replaced by
`elementState`; strategy gains `state` + `second`; thresholds `floor = 3.5`, `gap = 0.5`
recorded as tunable, to be calibrated against focus-group self-recognition.

## Tunable / open

- `floor` and `gap` values are first guesses; calibrate on the focus group by
  self-recognition. Per-axis split is possible later.
- Item-quality revision (the "mature behavior leaks into the wrong type" confound) is a
  **separate, follow-on** effort (step B): review the 16 strategy items / element items
  for ambiguous keying. Not in this spec.
