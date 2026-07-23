# Phase 2 interface-first contracts (Spec-First v2 §5)

Fix these contracts BEFORE parallel work. Phase 2 modules (content types, content loader, scoring, engine, submit endpoint) are then built against contracts, each in its own worktree, and merged at an integration checkpoint that runs cross-module golden tests. **Parallelize what a contract decouples; keep the coupled sequential.**

All types go in `packages/shared` (the single contract source) unless noted server-only.

## A. Content types (`@stasis/shared`, mirror the YAML)
```ts
type Recommendation = { trigger: string; action: string; minThreshold: string; doneCriterion: string; delegateVariant?: string };
type BeliefCard   = { element: Element; area: Area; strengthFraming: string; belief: string; pattern: string; recommendation: Recommendation; openQuestion: string };
type SphereInsight= { area: Area; observation: string; recommendation: Recommendation; reflectiveQuestion: string };
type StrategyProfile = { name: string; coreDrive: string; childhoodLogic: string; underStress: string; gift: string; cost: string; growthNudge: string };
type StrategyTestItem = { id: number; loads: Strategy; key: 'direct'|'reverse'; situation: string; statement: string };
type InteractionGuide = { you: Strategy; other: Strategy; collision: string; howTo: string[] };
type ContentBundle = { version: string; matrix: Record<Element, Partial<Record<Area, BeliefCard>>>; sphereInsights: Record<Area, SphereInsight>; strategies: Record<Strategy, StrategyProfile>; strategyTest: { scale: {min:number;max:number}; items: StrategyTestItem[] }; interactionGuides: InteractionGuide[] };
```

## B. Content loader (server-only, `content/loader.ts`)
- `loadContent(dir: string): ContentBundle` — reads/compiles YAML, throws on schema violation.
- `validateContent(bundle): void` — CI-callable: 4×6 matrix coverage, 6 sphereInsights, 4 profiles, 16 test items, 16 directed guide pairs, all `Recommendation` fields non-empty, forbidden-lexicon scan (диагноз/лечение/терапия/гарантия). Exit non-zero on failure.
- `contentVersion(bundle): string` — stable hash/semver, stamped into every result.

## C. Scoring (pure, `engine/scoring.ts`) — golden-tested
```ts
scoreElements(answers: LikertAnswer[], items: ElementItemMeta[]): { scores: Record<Element,number>; lead: Element; second: Element; isMixed: boolean };
scoreStrategies(answers: LikertAnswer[], items: StrategyTestItem[]): { scores: Record<Strategy,number>; lead: Strategy; second: Strategy; isMixed: boolean };
scoreResource(answers: LikertAnswer[]): { score: number; state: 'ok'|'low'|'critical' };
weakAreas(wheel: WheelScores): Area[];   // absolute threshold ≤3–4, worst-first, ≤3
```
Rules from spec §3: reverse via `7 - raw`; element mixed if lead-second ≤0.5; resource thresholds ok>2.5 / low≤2.5 / critical≤2.0-or-peak. **Plan Б hook:** `scoreElements` must tolerate a 2-axis remap without signature change (elements derived from two axes).

## D. Engine (pure, `engine/index.ts`) — from spec §4
```ts
computeMiniInsight(wheel, resourceAnswers, content): { weakArea: Area; imbalanceGap: number; resourceState; sphereInsightId: Area };
computeProfile(elementAnswers, strategyAnswers, wheel, resourceAnswers, content):
  { leadElement; secondElement; isMixed; weakAreas: Area[]; resourceState;
    beliefCardIds: {element:Element;area:Area}[]; leadStrategy; secondStrategy; isStrategyMixed;
    guideRefs: {you:Strategy;other:Strategy}[] };   // 4 outgoing guides
```
Returns IDs/refs, never rendered text. Deterministic; no DB/time/random.

## E. Submit endpoint (server, `app.ts`)
- `POST /submit` — `Authorization: Bearer <jwt>` (reuse the session guard extracted per reverse-spec seam), body `SubmitPayloadSchema` → validates → `computeProfile` → persists `test_runs`(enc) + `profiles`(refs) → `200 { profileId, result }` where `result` is rendered from content by ref. `401` bad session; `400` bad body.

## Parallelization plan
- **Parallel (contract-decoupled):** (B) content loader/validator, (C) scoring, (D) engine can be built concurrently — all depend only on types in (A) and the frozen YAML, not on each other's code.
- **Sequential (coupled):** (E) submit endpoint depends on (C)+(D)+DB repos → build after; integration checkpoint wires them and runs end-to-end golden tests (sample answers → expected profile + refs → rendered result).
- **Verify-before-done (§6):** a real submit exercised end-to-end (not just green units); typology claims gated by the pilot spike (see track-map).
