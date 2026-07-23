# Stasis MVP — Phase 2: Engine + Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> Contracts are frozen in `docs/spec-first/phase2-contracts.md` — this plan implements them. Design spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md` §3–5. Reverse-spec seams: `docs/spec-first/phase1-reverse-spec.md`.

**Goal:** Turn raw assessment answers into a rendered result — score the two typology axes + resourcefulness, compute the mini-insight and full profile deterministically, load/validate versioned content, persist runs, and expose `POST /submit`.

**Architecture:** Pure, golden-tested scoring + engine functions (no DB/time/random) in `apps/server/src/engine`; a content loader that compiles+validates the YAML in `content/` into a `ContentBundle`; new repositories for `test_runs`/`profiles`; a `POST /submit` route behind the session guard. Content shapes live in `@stasis/shared`. Per Spec-First v2 the **typology content is provisional** (spike-gated by the pilot + the "на зуб" test) — the engine is built against the existing validated content as fixtures; full 24-card authoring is a separate later step.

**Tech Stack:** TypeScript (strict, ESM), Vitest, zod, `js-yaml` (content parsing), `node:crypto` (AES-256-GCM). No new heavy deps.

## Global Constraints

- Node ≥20; TS strict; ESM; import siblings with `.js`. pnpm workspaces. Vitest; output pristine.
- **Never trust the client for computed values.** `/submit` accepts only `SubmitPayload` (raw answers + wheel) and recomputes everything server-side.
- Scoring + engine are **pure functions** (no DB, `Date.now()`, or randomness inside) → deterministic golden tests. Non-determinism lives only in content *wording*.
- Content is a versioned artifact separate from code; `validateContent` is CI-callable and fails closed. Forbidden lexicon (диагноз/диагностика/лечение/терапия/расстройство/гарантия/«научно доказано») must not appear in any content string.
- Raw sensitive fields (`element_answers`, `strategy_answers`, `resource_answers`, `wheel_scores`) encrypted at rest (AES-256-GCM, key from env `DATA_ENC_KEY`). `profiles` store refs, not rendered text.
- All DB access through repository functions; `Db` type never leaks into routes/services (Phase 1 rule).
- Scoring thresholds (spec §3): element reverse `7-raw`; element mixed if `lead-second ≤ 0.5`; strategy same; resource `state` = ok (>2.5) / low (≤2.5) / critical (≤2.0 OR any distress item peak 5–6); weak spheres = score ≤ 4, worst-first, max 3.
- **Plan Б hook:** `scoreElements` must be able to derive elements from a 2-axis remap later without changing its signature.

---

### Task 1: Shared content types + packaging fix

**Files:**
- Modify: `packages/shared/src/schemas.ts` (add content types + `ElementItemMeta`)
- Modify: `packages/shared/package.json` (build to `dist`, point `main`/`types` there)
- Create: `packages/shared/tsconfig.build.json`
- Test: `packages/shared/src/content-types.test.ts`

**Interfaces:**
- Consumes: existing `Element`, `Area`, `Strategy`, `LikertAnswer`.
- Produces: `Recommendation`, `BeliefCard`, `SphereInsight`, `StrategyProfile`, `StrategyTestItem`, `InteractionGuide`, `ElementItemMeta`, `ContentBundle` (shapes per `phase2-contracts.md §A`), all exported from `@stasis/shared`. Shared builds to `dist/` so downstream `tsc` builds resolve it.

- [ ] **Step 1: Write the failing test** — `packages/shared/src/content-types.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RecommendationSchema, BeliefCardSchema } from './schemas.js';

describe('content schemas', () => {
  it('accepts a full belief card', () => {
    const card = {
      element: 'fire', area: 'career', strengthFraming: 's', belief: 'b', pattern: 'p',
      recommendation: { trigger: 't', action: 'a', minThreshold: 'm', doneCriterion: 'd' },
      openQuestion: 'q',
    };
    expect(BeliefCardSchema.parse(card)).toMatchObject({ element: 'fire' });
  });
  it('rejects a recommendation missing doneCriterion', () => {
    expect(() => RecommendationSchema.parse({ trigger: 't', action: 'a', minThreshold: 'm' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/shared test src/content-types.test.ts`
Expected: FAIL — `RecommendationSchema` not exported.

- [ ] **Step 3: Add content schemas to `packages/shared/src/schemas.ts`** (append)

```ts
export const RecommendationSchema = z.object({
  trigger: z.string().min(1),
  action: z.string().min(1),
  minThreshold: z.string().min(1),
  doneCriterion: z.string().min(1),
  delegateVariant: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

const elementEnum = z.enum(ELEMENTS);
const areaEnum = z.enum(AREAS);
const strategyEnum = z.enum(STRATEGIES);

export const BeliefCardSchema = z.object({
  element: elementEnum, area: areaEnum,
  strengthFraming: z.string().min(1), belief: z.string().min(1), pattern: z.string().min(1),
  recommendation: RecommendationSchema, openQuestion: z.string().min(1),
});
export type BeliefCard = z.infer<typeof BeliefCardSchema>;

export const SphereInsightSchema = z.object({
  area: areaEnum, observation: z.string().min(1),
  recommendation: RecommendationSchema, reflectiveQuestion: z.string().min(1),
});
export type SphereInsight = z.infer<typeof SphereInsightSchema>;

export const StrategyProfileSchema = z.object({
  name: z.string(), coreDrive: z.string(), childhoodLogic: z.string(),
  underStress: z.string(), gift: z.string(), cost: z.string(), growthNudge: z.string(),
});
export type StrategyProfile = z.infer<typeof StrategyProfileSchema>;

export const StrategyTestItemSchema = z.object({
  id: z.number().int(), loads: strategyEnum, key: z.enum(['direct', 'reverse']),
  situation: z.string(), statement: z.string(),
});
export type StrategyTestItem = z.infer<typeof StrategyTestItemSchema>;

export const ElementItemMetaSchema = z.object({
  id: z.string().min(1), loads: elementEnum, key: z.enum(['direct', 'reverse']),
});
export type ElementItemMeta = z.infer<typeof ElementItemMetaSchema>;

export const InteractionGuideSchema = z.object({
  you: strategyEnum, other: strategyEnum,
  collision: z.string(), howTo: z.array(z.string().min(1)).min(1),
});
export type InteractionGuide = z.infer<typeof InteractionGuideSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/shared test src/content-types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Fix packaging** — `packages/shared/tsconfig.build.json`

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" } }
```

Then in `packages/shared/package.json` set:
```json
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
"scripts": { "typecheck": "tsc --noEmit", "test": "vitest run", "build": "tsc -p tsconfig.build.json" }
```
Add `"dist"` to the repo `.gitignore` if not already covered (it is: `dist/`).

- [ ] **Step 6: Verify workspace still resolves + full suite**

Run: `pnpm --filter @stasis/shared build && pnpm -r test`
Expected: shared emits `dist/`; all tests PASS (server still imports source in dev via workspace — Vitest resolves TS; the `dist` fields only affect downstream production builds).

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): content types (belief/insight/strategy/guide) + dist packaging"
```

---

### Task 2: Provisional assessment content files

**Files:**
- Create: `content/tests/elements.yaml` (24 element items — provisional, from the psychometrician draft; spike-gated)
- Create: `content/tests/resource.yaml` (4 resourcefulness items)
- Create: `content/matrix/sphere-insights.yaml` (the 6 element-agnostic cards, lifted from `flagship-cards.yaml` `sphereInsights`)
- Test: none (data files; validated by Task 3's `validateContent`).

**Interfaces:**
- Consumes: nothing.
- Produces: on-disk YAML the loader (Task 3) compiles. `elements.yaml` items each have `{ id, loads, key, statement }` (statement RU); `resource.yaml` items `{ id, key, statement }` with `key: distress` marking the two safety-trigger items.

- [ ] **Step 1: Create `content/tests/elements.yaml`** — 24 items, 6 per element, 2 reverse per element, RU statements about perception/decisions in **neutral** situations (orthogonal to strategies). Seed from the psychometrician's 12-item draft and extend to 24. Mark header `# PROVISIONAL — spike-gated by pilot (see docs/spec-first/track-map.md); items may be culled/rewritten after EFA.` Structure:
```yaml
version: 0.1.0-provisional
items:
  - { id: e-earth-1, loads: earth, key: direct, statement: "Прежде чем решить, я хочу опереться на конкретные факты и детали." }
  # ...6 per element (earth, air, water, fire), 2 key:reverse each
```
(Author the full 24 following the psychometrician's style; every element has exactly 6 items, exactly 2 `reverse`.)

- [ ] **Step 2: Create `content/tests/resource.yaml`**
```yaml
version: 0.1.0-provisional
window: "последние 2 недели"
items:
  - { id: r-energy,    key: direct,   statement: "В последние две недели у меня достаточно сил на важные дела." }
  - { id: r-sleep,     key: direct,   statement: "Я просыпаюсь отдохнувшим и восстановившимся." }
  - { id: r-exhaust,   key: distress, statement: "В последнее время я чувствую себя эмоционально опустошённым." }
  - { id: r-anhedonia, key: distress, statement: "Дела, которые обычно радовали, сейчас почти не приносят удовольствия." }
```

- [ ] **Step 3: Create `content/matrix/sphere-insights.yaml`** — copy the 6 `sphereInsights` from `flagship-cards.yaml` into a standalone file the loader reads (keep `flagship-cards.yaml` as the "на зуб" test artifact; this is the machine-loaded copy). Same 6 areas, same structure.

- [ ] **Step 4: Commit**
```bash
git add content/tests content/matrix/sphere-insights.yaml
git commit -m "content: provisional element + resource test items, loadable sphere insights"
```

---

### Task 3: Content loader + validator

**Files:**
- Create: `apps/server/src/content/loader.ts`
- Test: `apps/server/src/content/loader.test.ts`
- Add dep: `js-yaml` (+ `@types/js-yaml`) to `apps/server`.

**Interfaces:**
- Consumes: content YAML (Task 2 + existing `strategies.yaml`, `flagship-cards.yaml` matrix cards), `@stasis/shared` schemas.
- Produces:
  - `loadContent(rootDir: string): ContentBundle` — parses+validates all content, throws `ContentError` on any violation.
  - `validateContent(bundle: ContentBundle): void` — coverage + field + forbidden-lexicon checks; throws `ContentError`.
  - `contentVersion(bundle): string` — deterministic hash of the bundle.
  - `ContentBundle` type (server-local composition of shared shapes): `{ version, matrix, sphereInsights, strategies, strategyTest, interactionGuides, elementItems, resourceItems }`.

- [ ] **Step 1: Add dependency**

Run: `pnpm --filter @stasis/server add js-yaml && pnpm --filter @stasis/server add -D @types/js-yaml`
Expected: added to `apps/server/package.json`.

- [ ] **Step 2: Write the failing test** — `apps/server/src/content/loader.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadContent, validateContent, ContentError } from './loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'); // repo root

describe('content loader', () => {
  it('loads and validates the real content bundle', () => {
    const bundle = loadContent(ROOT);
    expect(Object.keys(bundle.sphereInsights)).toHaveLength(6);
    expect(bundle.interactionGuides).toHaveLength(16);
    expect(bundle.strategyTest.items).toHaveLength(16);
    expect(() => validateContent(bundle)).not.toThrow();
    expect(bundle.version).toMatch(/.+/);
  });

  it('rejects forbidden lexicon', () => {
    const bundle = loadContent(ROOT);
    // inject a violation
    (bundle.sphereInsights.health as any).observation = 'это диагноз для тебя';
    expect(() => validateContent(bundle)).toThrow(ContentError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/content/loader.test.ts`
Expected: FAIL — cannot resolve `./loader.js`.

- [ ] **Step 4: Implement `apps/server/src/content/loader.ts`**

```ts
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import {
  AREAS, ELEMENTS, STRATEGIES,
  SphereInsightSchema, BeliefCardSchema, StrategyProfileSchema,
  StrategyTestItemSchema, InteractionGuideSchema, ElementItemMetaSchema,
  type Area, type Element, type Strategy,
  type SphereInsight, type BeliefCard, type StrategyProfile,
  type StrategyTestItem, type InteractionGuide, type ElementItemMeta,
} from '@stasis/shared';

export class ContentError extends Error {}

export interface ResourceItem { id: string; key: 'direct' | 'distress'; statement: string }
export interface ContentBundle {
  version: string;
  matrix: Record<Element, Partial<Record<Area, BeliefCard>>>;
  sphereInsights: Record<Area, SphereInsight>;
  strategies: Record<Strategy, StrategyProfile>;
  strategyTest: { items: StrategyTestItem[] };
  interactionGuides: InteractionGuide[];
  elementItems: (ElementItemMeta & { statement: string })[];
  resourceItems: ResourceItem[];
}

const read = (p: string) => yaml.load(readFileSync(p, 'utf8')) as any;

const FORBIDDEN = /(диагноз|диагностик|лечени|терапи|расстройств|гаранти|научно доказан)/i;

export function loadContent(rootDir: string): ContentBundle {
  const cm = resolve(rootDir, 'content/matrix');
  const ct = resolve(rootDir, 'content/tests');
  const strat = read(resolve(cm, 'strategies.yaml'));
  const insights = read(resolve(cm, 'sphere-insights.yaml'));
  const cards = read(resolve(cm, 'flagship-cards.yaml'));
  const els = read(resolve(ct, 'elements.yaml'));
  const res = read(resolve(ct, 'resource.yaml'));

  try {
    const sphereInsights = Object.fromEntries(
      AREAS.map((a) => [a, SphereInsightSchema.parse(insights.sphereInsights[a])])
    ) as Record<Area, SphereInsight>;

    const matrix = {} as Record<Element, Partial<Record<Area, BeliefCard>>>;
    for (const el of ELEMENTS) {
      matrix[el] = {};
      const byArea = cards.matrix?.[el] ?? {};
      for (const a of Object.keys(byArea)) matrix[el][a as Area] = BeliefCardSchema.parse(byArea[a]);
    }

    const strategies = Object.fromEntries(
      STRATEGIES.map((s) => [s, StrategyProfileSchema.parse(strat.strategies[s])])
    ) as Record<Strategy, StrategyProfile>;

    const strategyTest = { items: strat.strategyTest.items.map((i: unknown) => StrategyTestItemSchema.parse(i)) };
    const interactionGuides = strat.interactionGuides.map((g: unknown) => InteractionGuideSchema.parse(g));
    const elementItems = els.items.map((i: any) => ({ ...ElementItemMetaSchema.parse(i), statement: String(i.statement) }));
    const resourceItems: ResourceItem[] = res.items.map((i: any) => ({ id: i.id, key: i.key, statement: i.statement }));

    const bundle: ContentBundle = { version: '', matrix, sphereInsights, strategies, strategyTest, interactionGuides, elementItems, resourceItems };
    bundle.version = contentVersion(bundle);
    return bundle;
  } catch (e) {
    throw new ContentError(`content parse/validate failed: ${(e as Error).message}`);
  }
}

export function contentVersion(bundle: Omit<ContentBundle, 'version'> | ContentBundle): string {
  const { version: _omit, ...rest } = bundle as ContentBundle;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 12);
}

export function validateContent(b: ContentBundle): void {
  const fail = (m: string) => { throw new ContentError(m); };
  for (const a of AREAS) if (!b.sphereInsights[a]) fail(`missing sphereInsight ${a}`);
  if (b.strategyTest.items.length !== 16) fail('strategyTest must have 16 items');
  const pairs = new Set(b.interactionGuides.map((g) => `${g.you}:${g.other}`));
  if (pairs.size !== 16) fail(`interactionGuides must cover 16 directed pairs, got ${pairs.size}`);
  for (const s of STRATEGIES) if (!b.strategies[s]) fail(`missing strategy profile ${s}`);
  const byEl = (el: Element) => b.elementItems.filter((i) => i.loads === el).length;
  for (const el of ELEMENTS) if (byEl(el) !== 6) fail(`element ${el} must have 6 items, got ${byEl(el)}`);
  // forbidden lexicon across all human-facing strings
  const strings: string[] = [];
  const walk = (v: any) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk({ si: b.sphereInsights, mx: b.matrix, st: b.strategies, ig: b.interactionGuides });
  for (const s of strings) if (FORBIDDEN.test(s)) fail(`forbidden lexicon in content: "${s.slice(0, 40)}…"`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/content/loader.test.ts`
Expected: PASS (2 tests). If a real content file trips validation, fix the CONTENT (not the validator) and note it in `SPEC_CHANGELOG.md`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/src/content
git commit -m "feat(server): content loader + validateContent (coverage, forbidden lexicon)"
```

---

### Task 4: Scoring (pure)

**Files:**
- Create: `apps/server/src/engine/scoring.ts`
- Test: `apps/server/src/engine/scoring.test.ts`

**Interfaces:**
- Consumes: `LikertAnswer`, `WheelScores`, `Area`/`Element`/`Strategy`, `ElementItemMeta`, `StrategyTestItem`, `ResourceItem`.
- Produces (per `phase2-contracts.md §C`):
  - `scoreElements(answers, items): { scores: Record<Element,number>; lead; second; isMixed }`
  - `scoreStrategies(answers, items): { scores: Record<Strategy,number>; lead; second; isMixed }`
  - `scoreResource(answers, items): { score: number; state: 'ok'|'low'|'critical' }`
  - `weakAreas(wheel): Area[]`

- [ ] **Step 1: Write the failing test** — `apps/server/src/engine/scoring.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scoreElements, scoreResource, weakAreas } from './scoring.js';
import type { ElementItemMeta } from '@stasis/shared';

const items: (ElementItemMeta & { statement: string })[] = [
  { id: 'f1', loads: 'fire', key: 'direct', statement: '' },
  { id: 'f2', loads: 'fire', key: 'direct', statement: '' },
  { id: 'e1', loads: 'earth', key: 'direct', statement: '' },
  { id: 'e2', loads: 'earth', key: 'reverse', statement: '' },
];

describe('scoreElements', () => {
  it('reverses reverse-keyed items and ranks lead/second', () => {
    const ans = [
      { itemId: 'f1', value: 6 }, { itemId: 'f2', value: 6 },
      { itemId: 'e1', value: 2 }, { itemId: 'e2', value: 1 }, // reverse -> 6
    ];
    const r = scoreElements(ans, items);
    expect(r.scores.fire).toBe(6);
    expect(r.scores.earth).toBe(4); // (2 + (7-1))/2
    expect(r.lead).toBe('fire');
  });
});

describe('weakAreas', () => {
  it('returns spheres <=4 worst-first, max 3', () => {
    expect(weakAreas({ health: 3, family: 8, rest: 4, friends: 9, career: 2, hobby: 7 }))
      .toEqual(['career', 'health', 'rest']);
  });
});

describe('scoreResource', () => {
  it('flags critical on a peak distress item', () => {
    const ritems = [
      { id: 'a', key: 'direct' as const, statement: '' },
      { id: 'x', key: 'distress' as const, statement: '' },
    ];
    const r = scoreResource([{ itemId: 'a', value: 5 }, { itemId: 'x', value: 6 }], ritems);
    expect(r.state).toBe('critical');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/engine/scoring.test.ts`
Expected: FAIL — cannot resolve `./scoring.js`.

- [ ] **Step 3: Implement `apps/server/src/engine/scoring.ts`**

```ts
import { AREAS, ELEMENTS, STRATEGIES, type Area, type Element, type Strategy,
  type LikertAnswer, type WheelScores, type ElementItemMeta, type StrategyTestItem } from '@stasis/shared';

const MIXED_GAP = 0.5;
const val = (answers: LikertAnswer[], id: string) => answers.find((a) => a.itemId === id)?.value;
const applied = (v: number, key: 'direct' | 'reverse') => (key === 'reverse' ? 7 - v : v);

function rank<T extends string>(scores: Record<T, number>, keys: readonly T[]) {
  const ordered = [...keys].sort((a, b) => scores[b] - scores[a]);
  const lead = ordered[0], second = ordered[1];
  return { lead, second, isMixed: scores[lead] - scores[second] <= MIXED_GAP };
}

function meanByGroup<T extends string>(
  answers: LikertAnswer[], items: { id: string; loads: T; key: 'direct' | 'reverse' }[], keys: readonly T[],
): Record<T, number> {
  const acc = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<T, number[]>;
  for (const it of items) { const v = val(answers, it.id); if (v != null) acc[it.loads].push(applied(v, it.key)); }
  return Object.fromEntries(keys.map((k) => [k, acc[k].length ? acc[k].reduce((s, n) => s + n, 0) / acc[k].length : 0])) as Record<T, number>;
}

export function scoreElements(answers: LikertAnswer[], items: (ElementItemMeta & { statement?: string })[]) {
  const scores = meanByGroup(answers, items, ELEMENTS);
  return { scores, ...rank(scores, ELEMENTS) };
}

export function scoreStrategies(answers: LikertAnswer[], items: StrategyTestItem[]) {
  const mapped = items.map((i) => ({ id: `s${i.id}`, loads: i.loads, key: i.key }));
  const scores = meanByGroup(answers, mapped, STRATEGIES);
  return { scores, ...rank(scores, STRATEGIES) };
}

export function scoreResource(
  answers: LikertAnswer[], items: { id: string; key: 'direct' | 'distress' }[],
): { score: number; state: 'ok' | 'low' | 'critical' } {
  const vals = items.map((i) => ({ key: i.key, v: val(answers, i.id) })).filter((x) => x.v != null) as { key: 'direct' | 'distress'; v: number }[];
  // distress items are reverse-scored into the resource mean (high distress -> low resource)
  const mean = vals.length ? vals.reduce((s, x) => s + (x.key === 'distress' ? 7 - x.v : x.v), 0) / vals.length : 6;
  const peakDistress = vals.some((x) => x.key === 'distress' && x.v >= 5);
  const state = mean <= 2.0 || peakDistress ? 'critical' : mean <= 2.5 ? 'low' : 'ok';
  return { score: Number(mean.toFixed(2)), state };
}

export function weakAreas(wheel: WheelScores): Area[] {
  return [...AREAS].filter((a) => wheel[a] <= 4).sort((a, b) => wheel[a] - wheel[b]).slice(0, 3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/engine/scoring.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/engine/scoring.ts apps/server/src/engine/scoring.test.ts
git commit -m "feat(server): pure scoring for elements, strategies, resource, weak areas"
```

---

### Task 5: Engine — mini-insight + full profile

**Files:**
- Create: `apps/server/src/engine/index.ts`
- Test: `apps/server/src/engine/index.test.ts`

**Interfaces:**
- Consumes: Task 4 scoring, `ContentBundle` (Task 3), shared types.
- Produces (per `phase2-contracts.md §D`):
  - `computeMiniInsight(wheel, resourceAnswers, content) → { weakArea, imbalanceGap, resourceState, sphereInsightId }`
  - `computeProfile(elementAnswers, strategyAnswers, wheel, resourceAnswers, content) → { leadElement, secondElement, isMixed, weakAreas, resourceState, beliefCardIds, leadStrategy, secondStrategy, isStrategyMixed, guideRefs }`
  - Both pure; return refs, not text.

- [ ] **Step 1: Write the failing test** — `apps/server/src/engine/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadContent } from '../content/loader.js';
import { computeMiniInsight, computeProfile } from './index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const content = loadContent(ROOT);
const wheel = { health: 3, family: 8, rest: 5, friends: 9, career: 2, hobby: 7 };
const res = [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }];

describe('computeMiniInsight', () => {
  it('picks the worst sphere and its insight, agnostic of typology', () => {
    const r = computeMiniInsight(wheel, res, content);
    expect(r.weakArea).toBe('career');
    expect(r.sphereInsightId).toBe('career');
    expect(r.resourceState).toBe('ok');
  });
});

describe('computeProfile', () => {
  it('returns belief refs for weak areas that exist in the matrix + 4 outgoing guides', () => {
    const elementAnswers = content.elementItems.map((i) => ({ itemId: i.id, value: i.loads === 'fire' ? 6 : 2 }));
    const strategyAnswers = content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: i.loads === 'avoidance' ? 6 : 2 }));
    const p = computeProfile(elementAnswers, strategyAnswers, wheel, res, content);
    expect(p.leadElement).toBe('fire');
    expect(p.leadStrategy).toBe('avoidance');
    expect(p.guideRefs).toHaveLength(4);
    expect(p.guideRefs.every((g) => g.you === 'avoidance')).toBe(true);
    // career weak + fire lead -> if matrix has fire.career, it's referenced
    if (content.matrix.fire.career) expect(p.beliefCardIds).toContainEqual({ element: 'fire', area: 'career' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/server test src/engine/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Implement `apps/server/src/engine/index.ts`**

```ts
import { STRATEGIES, type Area, type Strategy, type LikertAnswer, type WheelScores } from '@stasis/shared';
import type { ContentBundle, ResourceItem } from '../content/loader.js';
import { scoreElements, scoreStrategies, scoreResource, weakAreas } from './scoring.js';

export function computeMiniInsight(wheel: WheelScores, resourceAnswers: LikertAnswer[], content: ContentBundle) {
  const weak = weakAreas(wheel);
  const weakArea = weak[0] ?? lowestArea(wheel);
  const imbalanceGap = Math.max(...areaVals(wheel)) - Math.min(...areaVals(wheel));
  const { state } = scoreResource(resourceAnswers, content.resourceItems);
  return { weakArea, imbalanceGap, resourceState: state, sphereInsightId: weakArea };
}

export function computeProfile(
  elementAnswers: LikertAnswer[], strategyAnswers: LikertAnswer[],
  wheel: WheelScores, resourceAnswers: LikertAnswer[], content: ContentBundle,
) {
  const el = scoreElements(elementAnswers, content.elementItems);
  const st = scoreStrategies(strategyAnswers, content.strategyTest.items);
  const { state } = scoreResource(resourceAnswers, content.resourceItems);
  const weak = weakAreas(wheel);
  const beliefCardIds = weak
    .filter((a) => content.matrix[el.lead]?.[a])
    .map((a) => ({ element: el.lead, area: a }))
    .slice(0, 3);
  const guideRefs = STRATEGIES.map((other) => ({ you: st.lead, other }));
  return {
    leadElement: el.lead, secondElement: el.second, isMixed: el.isMixed,
    weakAreas: weak, resourceState: state, beliefCardIds,
    leadStrategy: st.lead, secondStrategy: st.second, isStrategyMixed: st.isMixed, guideRefs,
  };
}

const areaVals = (w: WheelScores) => Object.values(w);
const lowestArea = (w: WheelScores): Area =>
  (Object.entries(w).sort((a, b) => a[1] - b[1])[0][0]) as Area;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/server test src/engine/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/engine/index.ts apps/server/src/engine/index.test.ts
git commit -m "feat(server): engine computeMiniInsight + computeProfile (deterministic, refs only)"
```

---

### Task 6: Persistence + `POST /submit`

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (add `test_runs`, `profiles` tables)
- Create: `apps/server/src/db/runs.repo.ts`
- Create: `apps/server/src/crypto/field.ts` (AES-256-GCM helpers)
- Modify: `apps/server/src/app.ts` (extract `requireSession`; add `POST /submit`)
- Modify: `apps/server/src/config.ts` (require `DATA_ENC_KEY`)
- Test: `apps/server/src/crypto/field.test.ts`, `apps/server/src/app.submit.test.ts`

**Interfaces:**
- Consumes: engine (Task 5), content loader (Task 3), `SubmitPayloadSchema`, session verify (Phase 1).
- Produces:
  - `encryptField(plaintext, key) / decryptField(payload, key)` (AES-256-GCM, key = 32-byte hex).
  - `runsRepo(db)` → `saveRun(userId, payload, profile, versions): { profileId }` storing encrypted raw answers in `test_runs` and refs in `profiles`.
  - `POST /submit` — `Authorization: Bearer <jwt>`, body `SubmitPayload` → `200 { profileId, result }` (result rendered from content by refs); `400` bad body; `401` bad session.
  - `requireSession(req)` preHandler helper (extracted from `/me`).

- [ ] **Step 1: Write the failing test (crypto)** — `apps/server/src/crypto/field.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from './field.js';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('field crypto', () => {
  it('round-trips and rejects tampering', () => {
    const ct = encryptField('секрет', KEY);
    expect(ct).not.toContain('секрет');
    expect(decryptField(ct, KEY)).toBe('секрет');
    expect(() => decryptField(ct.slice(0, -2) + 'ff', KEY)).toThrow();
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `pnpm --filter @stasis/server test src/crypto/field.test.ts` → FAIL (no `./field.js`).

- [ ] **Step 3: Implement `apps/server/src/crypto/field.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keyBuf = (hex: string) => { const b = Buffer.from(hex, 'hex'); if (b.length !== 32) throw new Error('DATA_ENC_KEY must be 32 bytes hex'); return b; };

export function encryptField(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyBuf(keyHex), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), ct.toString('hex')].join(':');
}
export function decryptField(payload: string, keyHex: string): string {
  const [ivH, tagH, ctH] = payload.split(':');
  const d = createDecipheriv('aes-256-gcm', keyBuf(keyHex), Buffer.from(ivH, 'hex'));
  d.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run + pass** — `pnpm --filter @stasis/server test src/crypto/field.test.ts` → PASS.

- [ ] **Step 5: Extend `migrate.ts`** (append inside `runMigrations`)

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content_version TEXT NOT NULL,
    wheel_scores TEXT NOT NULL, element_answers TEXT NOT NULL,
    strategy_answers TEXT NOT NULL, resource_answers TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER NOT NULL REFERENCES test_runs(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    lead_element TEXT NOT NULL, second_element TEXT, is_mixed INTEGER NOT NULL,
    weak_areas TEXT NOT NULL, resource_state TEXT NOT NULL, belief_card_ids TEXT NOT NULL,
    lead_strategy TEXT NOT NULL, second_strategy TEXT, guide_refs TEXT NOT NULL,
    engine_version TEXT NOT NULL, content_version TEXT NOT NULL, created_at INTEGER NOT NULL
  );
`);
```

- [ ] **Step 6: Implement `apps/server/src/db/runs.repo.ts`**

```ts
import type { Db } from './connection.js';
import { encryptField } from '../crypto/field.js';
import type { SubmitPayload } from '@stasis/shared';

const ENGINE_VERSION = '2.0.0';

export function runsRepo(db: Db, encKey: string) {
  const insRun = db.prepare(`INSERT INTO test_runs
    (user_id, content_version, wheel_scores, element_answers, strategy_answers, resource_answers, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insProfile = db.prepare(`INSERT INTO profiles
    (test_run_id, user_id, lead_element, second_element, is_mixed, weak_areas, resource_state,
     belief_card_ids, lead_strategy, second_strategy, guide_refs, engine_version, content_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    saveRun(userId: number, payload: SubmitPayload, profile: any, contentVersion: string): { profileId: number } {
      const now = Date.now();
      const enc = (o: unknown) => encryptField(JSON.stringify(o), encKey);
      const run = insRun.run(userId, contentVersion, enc(payload.wheel), enc(payload.elementAnswers),
        enc(payload.strategyAnswers), enc(payload.resourceAnswers), now);
      const testRunId = Number(run.lastInsertRowid);
      const p = insProfile.run(testRunId, userId, profile.leadElement, profile.secondElement ?? null,
        profile.isMixed ? 1 : 0, JSON.stringify(profile.weakAreas), profile.resourceState,
        JSON.stringify(profile.beliefCardIds), profile.leadStrategy, profile.secondStrategy ?? null,
        JSON.stringify(profile.guideRefs), ENGINE_VERSION, contentVersion, now);
      return { profileId: Number(p.lastInsertRowid) };
    },
  };
}
export { ENGINE_VERSION };
```

- [ ] **Step 7: Write the failing test (submit)** — `apps/server/src/app.submit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { sign } from '@telegram-apps/init-data-node';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BOT = '123456:TESTTOKEN', SECRET = 'test-secret', ENC = 'a'.repeat(64);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent(ROOT);
const fresh = () => { const n = new Date(); return sign({ user: { id: 42, firstName: 'I' }, auth_date: n } as any, BOT, n); };

async function token(app: any) {
  const r = await app.inject({ method: 'POST', url: '/auth', headers: { authorization: `tma ${fresh()}` } });
  return r.json().token;
}

describe('POST /submit', () => {
  it('scores a full payload and returns a profileId + result', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    const body = {
      wheel: { health: 3, family: 8, rest: 5, friends: 9, career: 2, hobby: 7 },
      elementAnswers: content.elementItems.map((i) => ({ itemId: i.id, value: 4 })),
      strategyAnswers: content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: 4 })),
      resourceAnswers: [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }],
    };
    const res = await app.inject({ method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` }, payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json().profileId).toBeGreaterThan(0);
    expect(res.json().result.leadElement).toBeDefined();
  });

  it('rejects a bad body with 400 and no session with 401', async () => {
    const app = buildApp({ db: openDb(':memory:'), botToken: BOT, jwtSecret: SECRET, encKey: ENC, content });
    const t = await token(app);
    expect((await app.inject({ method: 'POST', url: '/submit', headers: { authorization: `Bearer ${t}` }, payload: { wheel: {} } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/submit', headers: { authorization: 'Bearer nope' }, payload: {} })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 8: Run + fail** — `pnpm --filter @stasis/server test src/app.submit.test.ts` → FAIL (buildApp lacks `encKey`/`content`; no `/submit`).

- [ ] **Step 9: Update `config.ts`** — require `DATA_ENC_KEY`; add to returned config.

```ts
if (!process.env.DATA_ENC_KEY) throw new Error('DATA_ENC_KEY is required');
// add: encKey: process.env.DATA_ENC_KEY,
```
Also add `DATA_ENC_KEY=...(64 hex)` to `.env.example`.

- [ ] **Step 10: Update `app.ts`** — extend deps, extract `requireSession`, add `/submit`.

```ts
// deps: add encKey: string; content: ContentBundle
// import: SubmitPayloadSchema from '@stasis/shared'; runsRepo, ENGINE_VERSION; computeProfile; SessionError
function readSession(req: any, secret: string): { userId: number } {
  const h = req.headers.authorization ?? '';
  return verifySession(h.startsWith('Bearer ') ? h.slice(7) : '', secret);
}
// inside buildApp, after users:
const runs = runsRepo(deps.db, deps.encKey);

app.post('/submit', async (req, reply) => {
  let userId: number;
  try { userId = readSession(req, deps.jwtSecret).userId; }
  catch (e) { if (e instanceof SessionError) return reply.code(401).send({ error: 'invalid_session' }); throw e; }
  const parsed = SubmitPayloadSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
  const profile = computeProfile(parsed.data.elementAnswers, parsed.data.strategyAnswers, parsed.data.wheel, parsed.data.resourceAnswers, deps.content);
  const { profileId } = runs.saveRun(userId, parsed.data, profile, deps.content.version);
  return { profileId, result: profile };
});
```
(Refactor `/me` to reuse `readSession` — behavior unchanged; keep the getById + 401 path.)

- [ ] **Step 11: Update `main.ts`** — load content once + pass `encKey`, `content` into `buildApp`.

```ts
import { loadContent } from './content/loader.js';
// const content = loadContent(process.cwd()); const app = buildApp({ ..., encKey: cfg.encKey, content });
```

- [ ] **Step 12: Run submit test + full suite + typecheck**

Run: `pnpm --filter @stasis/server test src/app.submit.test.ts` → PASS.
Run: `pnpm -r test && pnpm -r typecheck` → all green.

- [ ] **Step 13: Commit**

```bash
git add apps/server content SPEC_CHANGELOG.md
git commit -m "feat(server): /submit — score + persist (encrypted raw, profile refs)"
```

- [ ] **Step 14: Verify-before-done (Spec-First v2 §6)** — start the server against a file DB and exercise a real submit end-to-end (auth → submit → 200 with a profile), not just green units. Record the observation in the Task 6 report. Note in `SPEC_CHANGELOG.md` any interface drift from this plan.

---

## Self-Review

**Spec coverage:** wheel scoring + weak areas (§3.1, Task 4) · elements test scoring + mixed (§3.2, Task 4) · resourcefulness + safety state (§3.3, Task 4) · strategy sub-test scoring (§3.4, Task 4) · mini-insight + full profile engine (§4, Task 5) · content matrix + sphereInsights + strategies + interaction guides loading & CI validation (§5, Tasks 2–3) · three-tier persistence with encrypted raw + profile refs (§8, Task 6) · `/submit` (contract §E, Task 6). Result *rendering* to final UI text and the sharing/OG path are Phase 3–4. Full 24-card matrix authoring is spike-gated (track-map) — engine runs on provisional content.

**Placeholder scan:** Task 2 asks the author to complete the 24 element items in the psychometrician's style — this is content authoring, not a code placeholder; the shape and constraints (6/element, 2 reverse) are exact. All code steps carry complete code.

**Type consistency:** `ContentBundle` (loader) is the single content type consumed by scoring/engine/submit; `computeProfile`'s return shape is persisted field-for-field by `runsRepo.saveRun` and returned as `result`; `ElementItemMeta & {statement}` used consistently for element items; `resourceItems` typed `{id,key:'direct'|'distress'}` in loader, scoring, and engine. `buildApp` deps extended (`encKey`, `content`) consistently across app.ts, main.ts, and both app tests.

**Drift note:** `ENGINE_VERSION='2.0.0'` introduced here; record in `SPEC_CHANGELOG.md` on completion.

---

*Phase 2 delivers scoring → engine → persisted result via `/submit`. Phase 3 (Mini App UI) renders the result and drives the flow; Phase 4 adds bot/sharing/follow-up.*
