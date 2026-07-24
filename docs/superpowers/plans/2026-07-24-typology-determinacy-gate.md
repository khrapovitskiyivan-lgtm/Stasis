# Typology Determinacy Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the typology result from emitting a false-confident single "lead" type on flat/tied profiles; emit an honest `confident | mixed | none` state per axis and render it.

**Architecture:** One shared `rank()` in the pure engine gains a determinacy state (floor + gap). It propagates through `computeProfile` → `renderResult` → the zod `RenderedResult` contract → the React `ResultScreen`, which branches into three presentations per axis. Copy for the mixed/none framings lives as UI constants (same pattern as existing `ELEMENT_STRENGTH_COPY`); content YAML is untouched.

**Tech Stack:** TypeScript (strict, ESM), Node ≥24, Fastify, Vitest, React + Vite, zod (`@stasis/shared` contract).

**Spec:** `docs/superpowers/specs/2026-07-24-typology-determinacy-gate-design.md`

## Global Constraints

- ESM everywhere; import siblings with an explicit `.js` extension.
- Engine stays pure/deterministic (no DB/time/random); golden tests must pass.
- The zod schemas in `packages/shared` are the single client↔server contract — change the schema first, both sides follow.
- Thresholds are exact: determinacy floor = `3.5`, gap = `0.5` (the mean scale is 1–6).
- `@stasis/shared` must be rebuilt (`pnpm --filter @stasis/shared build`) after any schema change or the server/client pick up stale `dist`.
- Do NOT touch: content YAML, DB/repositories logic, sharing, follow-up, wheel, consent.
- Forbidden lexicon rule still applies to any new user-facing string (no диагноз/лечени/терапи/гаранти).

---

### Task 1: Determinacy state in the engine + contract (server)

Emits `state: 'confident' | 'mixed' | 'none'` for both axes end-to-end on the server; server build + tests green at the end.

**Files:**
- Modify: `apps/server/src/engine/scoring.ts`
- Modify: `apps/server/src/engine/index.ts` (`computeProfile` return)
- Modify: `apps/server/src/engine/render.ts` (`renderResult` output)
- Modify: `packages/shared/src/schemas.ts` (`RenderedResultSchema`)
- Test: `apps/server/src/engine/scoring.test.ts`
- Test/fixtures: `apps/server/src/engine/render.test.ts`, `apps/server/src/engine/index.test.ts`, `apps/server/src/db/deletion.test.ts`

**Interfaces:**
- Produces: `type Determinacy = 'confident' | 'mixed' | 'none'`.
- Produces: `rank(scores, keys)` → `{ lead, second, state: Determinacy }` (no more `isMixed`).
- Produces: `computeProfile(...)` → `{ …, elementState: Determinacy, …, strategyState: Determinacy, … }` (replaces `isMixed`/`isStrategyMixed`).
- Produces: `RenderedResult.elementState: Determinacy`; `RenderedResult.strategy: { state: Determinacy, lead, second: StrategyProfile | null, guides }` (replaces top-level `isMixed`).

- [ ] **Step 1: Write failing scoring tests for the three states**

Add to `apps/server/src/engine/scoring.test.ts`. `scoreStrategies` takes `(answers, items)`; build answers that force each state. Items load 4-per-strategy; answer id is `s${item.id}`. A value of 6 on a `direct` item, 1 on a `reverse` item, drives that strategy's mean up.

```ts
import { describe, it, expect } from 'vitest';
import { scoreStrategies } from './scoring.js';
import type { StrategyTestItem } from '@stasis/shared';

// 4 items per strategy, all direct, ids 1..16 in STRATEGIES order groups.
const STRAT_ITEMS: StrategyTestItem[] = [
  ...[1, 2, 3, 4].map((id) => ({ id, loads: 'power', key: 'direct', situation: 's', statement: 's' } as StrategyTestItem)),
  ...[5, 6, 7, 8].map((id) => ({ id, loads: 'attention', key: 'direct', situation: 's', statement: 's' } as StrategyTestItem)),
  ...[9, 10, 11, 12].map((id) => ({ id, loads: 'superiority', key: 'direct', situation: 's', statement: 's' } as StrategyTestItem)),
  ...[13, 14, 15, 16].map((id) => ({ id, loads: 'avoidance', key: 'direct', situation: 's', statement: 's' } as StrategyTestItem)),
];
const answer = (id: number, value: number) => ({ itemId: `s${id}`, value });

describe('scoreStrategies determinacy', () => {
  it('confident: one strategy clearly above the others and above the floor', () => {
    // avoidance items (13-16) = 6, everything else = 1
    const answers = STRAT_ITEMS.map((i) => answer(i.id, i.loads === 'avoidance' ? 6 : 1));
    const r = scoreStrategies(answers, STRAT_ITEMS);
    expect(r.lead).toBe('avoidance');
    expect(r.state).toBe('confident');
  });

  it('none: flat/low profile does NOT default to the first-listed strategy (power)', () => {
    // everything low (2) → no lead clears the 3.5 floor
    const answers = STRAT_ITEMS.map((i) => answer(i.id, 2));
    const r = scoreStrategies(answers, STRAT_ITEMS);
    expect(r.state).toBe('none');
  });

  it('mixed: two strategies both above the floor and within the gap', () => {
    // power and avoidance both high (5), others low (1)
    const answers = STRAT_ITEMS.map((i) =>
      answer(i.id, i.loads === 'power' || i.loads === 'avoidance' ? 5 : 1)
    );
    const r = scoreStrategies(answers, STRAT_ITEMS);
    expect(r.state).toBe('mixed');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @stasis/server test -- scoring`
Expected: FAIL — `r.state` is undefined (rank returns `isMixed`, not `state`).

- [ ] **Step 3: Implement determinacy in `rank()`**

In `apps/server/src/engine/scoring.ts`, replace the `MIXED_GAP` constant and `rank` function:

```ts
const DETERMINACY_FLOOR = 3.5; // lead must clear the 1–6 scale midpoint to count as endorsed
const DETERMINACY_GAP = 0.5;   // min lead-over-second margin to read as a single confident type

export type Determinacy = 'confident' | 'mixed' | 'none';

function rank<T extends string>(scores: Record<T, number>, keys: readonly T[]) {
  const ordered = [...keys].sort((a, b) => scores[b] - scores[a]);
  const lead = ordered[0], second = ordered[1];
  const state: Determinacy =
    scores[lead] < DETERMINACY_FLOOR
      ? 'none'
      : scores[lead] - scores[second] <= DETERMINACY_GAP
        ? 'mixed'
        : 'confident';
  return { lead, second, state };
}
```

`scoreElements` and `scoreStrategies` already spread `...rank(...)`, so they now return `{ scores, lead, second, state }` with no change to their bodies.

- [ ] **Step 4: Run scoring tests to verify they pass**

Run: `pnpm --filter @stasis/server test -- scoring`
Expected: PASS.

- [ ] **Step 5: Propagate state through `computeProfile`**

In `apps/server/src/engine/index.ts`, change the returned object (replace `isMixed`/`isStrategyMixed`):

```ts
  return {
    leadElement: el.lead, secondElement: el.second, elementState: el.state,
    weakAreas: weak, weakArea, resourceState: state, beliefCardIds,
    leadStrategy: st.lead, secondStrategy: st.second, strategyState: st.state, guideRefs,
  };
```

- [ ] **Step 6: Update the contract `RenderedResultSchema`**

In `packages/shared/src/schemas.ts`, replace the `RenderedResultSchema`:

```ts
export const RenderedResultSchema = z.object({
  leadElement: elementEnum, secondElement: elementEnum.nullable(),
  elementState: z.enum(['confident', 'mixed', 'none']),
  resourceState: z.enum(['ok', 'low', 'critical']),
  sphereInsight: SphereInsightSchema,
  beliefCards: z.array(BeliefCardSchema),
  strategy: z.object({
    state: z.enum(['confident', 'mixed', 'none']),
    lead: StrategyProfileSchema,
    second: StrategyProfileSchema.nullable(),
    guides: z.array(InteractionGuideSchema),
  }),
});
```

- [ ] **Step 7: Rebuild the shared contract**

Run: `pnpm --filter @stasis/shared build`
Expected: `Done` (tsc emits new `dist`). This makes the new types visible to server + client.

- [ ] **Step 8: Update `renderResult` to the new shape**

In `apps/server/src/engine/render.ts`, replace the returned object:

```ts
  return {
    leadElement: p.leadElement,
    secondElement: p.secondElement ?? null,
    elementState: p.elementState,
    resourceState: p.resourceState,
    sphereInsight: content.sphereInsights[p.weakArea],
    beliefCards,
    strategy: {
      state: p.strategyState,
      lead: content.strategies[p.leadStrategy],
      second: content.strategies[p.secondStrategy] ?? null,
      guides,
    },
  };
```

- [ ] **Step 9: Fix server test fixtures that build a `RenderedResult`**

Two known fixtures use the old shape. Update each:

`apps/server/src/db/deletion.test.ts` (~line 15) — replace `isMixed: false,` with `elementState: 'confident',` and change `strategy: { lead: …, guides: … }` to include the new fields:
```ts
    strategy: { state: 'confident', lead: /* existing lead */, second: null, guides: [] },
```

`apps/server/src/engine/render.test.ts` — if any assertion reads `.isMixed`, change it to `.elementState`; if it asserts the strategy object shape, add `state` and `second`. Add one assertion:
```ts
    expect(r.elementState).toBeDefined();
    expect(r.strategy.state).toBeDefined();
```

`apps/server/src/engine/index.test.ts` — if it asserts `computeProfile(...).isMixed` / `.isStrategyMixed`, rename to `.elementState` / `.strategyState`.

- [ ] **Step 10: Run the full server test suite**

Run: `pnpm --filter @stasis/server test`
Expected: PASS (all files). Fix any remaining `isMixed` references the compiler/tests flag.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/schemas.ts apps/server/src/engine/ apps/server/src/db/deletion.test.ts
git commit -m "feat(engine): determinacy gate — confident/mixed/none per typology axis"
```

---

### Task 2: Render the three states in the Mini App

`ResultScreen` branches per axis; client build + tests green at the end.

**Files:**
- Modify: `apps/miniapp/src/screens/ResultScreen.tsx`
- Test: `apps/miniapp/src/screens/result.test.tsx`

**Interfaces:**
- Consumes: `RenderedResult.elementState`, `RenderedResult.secondElement`, `RenderedResult.strategy.state`, `RenderedResult.strategy.second` (from Task 1).

- [ ] **Step 1: Update the test fixture and add state-branch tests**

In `apps/miniapp/src/screens/result.test.tsx`, in `makeResult(...)`: remove `isMixed: false,`, add `elementState: 'confident',`, and change `strategy` to `{ state: 'confident', lead: { …existing… }, second: null, guides: [ …existing… ] }`.

Then add tests:
```ts
  it('element "none" state hides the single-element claim and shows the honest message', () => {
    render(<ResultScreen result={makeResult({ elementState: 'none', secondElement: 'water' })}
      onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.getByText(/ярко выраженной стихии не проявилось/i)).toBeInTheDocument();
    expect(screen.queryByText(/твоя стихия —/i)).not.toBeInTheDocument();
  });

  it('strategy "none" state hides the profile and guides', () => {
    const r = makeResult({ strategy: { state: 'none', lead: makeResult().strategy.lead, second: null, guides: [] } });
    render(<ResultScreen result={r} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.getByText(/выраженной стратегии не проявилось/i)).toBeInTheDocument();
    expect(screen.queryByText(r.strategy.lead.gift)).not.toBeInTheDocument();
  });

  it('strategy "mixed" names the lead with a secondary tint', () => {
    const base = makeResult();
    const r = makeResult({ strategy: { state: 'mixed', lead: base.strategy.lead,
      second: { ...base.strategy.lead, name: 'Уклонение' }, guides: base.strategy.guides } });
    render(<ResultScreen result={r} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.getByText(/с оттенком Уклонение/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @stasis/miniapp test -- result`
Expected: FAIL — the honest-message text does not exist yet.

- [ ] **Step 3: Replace the element strength section with three branches**

In `apps/miniapp/src/screens/ResultScreen.tsx`, replace the `result-strength` `<section>` body:

```tsx
      <section className="result-section result-strength" aria-label="Сила">
        <h2 className="result-section-title">Сила</h2>
        {result.elementState === 'none' ? (
          <p className="screen-text">
            Ярко выраженной стихии не проявилось — ближе всего {ELEMENT_LABELS[result.leadElement]}
            {result.secondElement ? ` и ${ELEMENT_LABELS[result.secondElement]}` : ''}, но некрепко. Это нормально.
          </p>
        ) : result.elementState === 'mixed' && result.secondElement ? (
          <>
            <p className="screen-text">
              Смешанный профиль: {ELEMENT_LABELS[result.leadElement]} и {ELEMENT_LABELS[result.secondElement]}.
            </p>
            <p className="screen-text">{ELEMENT_STRENGTH_COPY[result.leadElement]}</p>
            <p className="screen-text">{ELEMENT_STRENGTH_COPY[result.secondElement]}</p>
          </>
        ) : (
          <p className="screen-text">
            Твоя стихия — {ELEMENT_LABELS[result.leadElement]}. {ELEMENT_STRENGTH_COPY[result.leadElement]}
          </p>
        )}
      </section>
```

- [ ] **Step 4: Replace the strategy section with three branches**

Replace the `result-strategy` `<section>`:

```tsx
      {result.strategy.state === 'none' ? (
        <section className="result-section result-strategy" aria-label="Стратегия">
          <h2 className="result-section-title">Стратегия под стрессом</h2>
          <p className="screen-text">
            Под стрессом выраженной стратегии не проявилось
            {result.strategy.second
              ? ` — иногда склоняешься к «${result.strategy.lead.name}» или «${result.strategy.second.name}», но некрепко.`
              : '.'}
          </p>
        </section>
      ) : (
        <section className="result-section result-strategy" aria-label="Стратегия">
          <h2 className="result-section-title">
            {result.strategy.state === 'mixed' && result.strategy.second
              ? `${result.strategy.lead.name} с оттенком ${result.strategy.second.name}`
              : result.strategy.lead.name}
          </h2>
          <p className="screen-text">{result.strategy.lead.gift}</p>
          <p className="screen-text">{result.strategy.lead.cost}</p>
          <p className="screen-text result-growth-nudge">{result.strategy.lead.growthNudge}</p>
          {result.strategy.state === 'mixed' && result.strategy.second ? (
            <p className="screen-text">Оттенок «{result.strategy.second.name}»: {result.strategy.second.gift}</p>
          ) : null}

          <div className="result-guides">
            {result.strategy.guides.map((guide, idx) => (
              <div key={idx} className="result-guide">
                <p className="result-guide-collision">{guide.collision}</p>
                <ul className="result-guide-howto">
                  {guide.howTo.map((step, stepIdx) => (
                    <li key={stepIdx}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 5: Run the result tests to verify they pass**

Run: `pnpm --filter @stasis/miniapp test -- result`
Expected: PASS.

- [ ] **Step 6: Run the full miniapp suite**

Run: `pnpm --filter @stasis/miniapp test`
Expected: PASS (63+ tests). Fix any fixture that still references `isMixed`.

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/src/screens/ResultScreen.tsx apps/miniapp/src/screens/result.test.tsx
git commit -m "feat(miniapp): render confident/mixed/none typology states honestly"
```

---

### Task 3: Whole-repo verification, changelog, prototype redeploy note

**Files:**
- Modify: `SPEC_CHANGELOG.md`

- [ ] **Step 1: Full build + test across the workspace**

Run: `pnpm -r build` (with `VITE_POLICY_URL=/policy.html VITE_OFFER_URL=/offer.html` set for the miniapp) then `pnpm -r test`
Expected: shared/server/miniapp all build; all tests PASS.

- [ ] **Step 2: Record the deviation in `SPEC_CHANGELOG.md`**

Append an entry:
```markdown
## 2026-07-24 — Typology determinacy gate
- `rank()` now emits `confident | mixed | none` per axis (floor 3.5, gap 0.5) instead of always forcing a single lead with an array-order tie-break. Fixes the flat-profile mislabel (power on strategy, first-listed element). Contract: `RenderedResult.isMixed` → `elementState`; `strategy` gains `state` + `second`. Thresholds are tunable, to be calibrated on focus-group self-recognition. Item-quality revision (step B) deferred.
```

- [ ] **Step 3: Commit**

```bash
git add SPEC_CHANGELOG.md
git commit -m "docs(changelog): typology determinacy gate"
```

- [ ] **Step 4: Prototype redeploy note (only if the tunnel prototype is being served)**

The running node server indexes `apps/miniapp/dist` assets at boot (`@fastify/static` `wildcard:false`), so after the miniapp rebuild the server MUST be restarted or it serves a stale/blank bundle. Also: stored `RenderedResult` rows from before this change have the old shape — the focus-group DB is throwaway, so delete `data/stasis.sqlite` (or accept fresh runs) before serving the new build. This step is operational, not a code change.

---

## Notes

- The engine change is the whole fix; the UI change only surfaces it honestly. Thresholds (3.5 / 0.5) are first guesses — calibrate against focus-group self-recognition, and split per-axis only if needed.
- `SharePublicPayload` (share card) uses `leadElement` only and is intentionally unchanged — a share still names the top element even on a `mixed`/`none` profile. If that feels dishonest later, it is a separate, out-of-scope decision.
