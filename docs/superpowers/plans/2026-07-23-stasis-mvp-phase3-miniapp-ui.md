# Stasis MVP — Phase 3: Mini App UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> Builds the `apps/miniapp` React front-end that drives the flow and renders the result. Design spec: `docs/superpowers/specs/2026-07-22-stasis-solo-mvp-design.md` §2 (flow), §6 (result methodology), §12.2 (pilot signals). Contracts: `packages/shared`. Reverse-spec seams: Phase 1/2 endpoints (`/auth`, `/submit`).

**Goal:** A Telegram Mini App that takes the user through consent → wheel → resource → mini-insight → (optional) typology tests → rendered result with feedback capture, talking to the existing backend.

**Architecture:** React 18 + TS + Vite in `apps/miniapp`. `@telegram-apps/sdk-react` for the Mini App bridge (initData, theme, Main/BackButton). A typed API client exchanges `initData`→JWT and posts `SubmitPayload`. Flow state is a `useReducer` wizard. The **server** gains a small result-rendering step so `/submit` returns the user's rendered text slice (refs resolved server-side — protects the content IP; client renders no matrix). The wheel is a dependency-free SVG radar.

**Tech Stack:** React 18, TypeScript (strict), Vite, `@telegram-apps/sdk-react`, `@stasis/shared`, Vitest + `@testing-library/react` + `jsdom`.

## Global Constraints

- TS strict; ESM; pnpm workspace (`apps/miniapp`). Reuse `@stasis/shared` schemas/types — never re-declare a payload shape.
- Client sends only raw answers + `initData`; it never computes the profile. It renders the server-provided `RenderedResult`.
- Non-deterministic, supportive copy is server-owned (content). The UI only lays out server text; it must not hardcode belief/strategy wording.
- Result screen order (spec §6): **Сила → Состояние → Точка застоя → Шаг → Как ты во взаимодействии**; ≥2:1 strength-to-deficit; readiness question before the step; tone toggle «Бережно/Прямо» (forced «Бережно» when `resourceState !== 'ok'`); safety block with support resources when `resourceState === 'critical'`.
- Consent + 18+ gate BEFORE any assessment; «не диагноз/не терапия» disclaimer on entry and result.
- Pilot signals (spec §12.2): «это не про меня» per card + 1-tap «точно про меня / общо» on result + drop-off/share — POST to a lightweight signal endpoint, no PII.
- Theme-aware: honor Telegram `themeParams` (light/dark). Responsive to phone widths. No external network beyond our API (CSP-friendly).
- Aesthetic (frontend-design): calm, premium, reflective — not clinical. Generous whitespace, large type, soft per-element accent colors, minimal chrome.

---

### Task 1: Server — render result from refs

**Files:**
- Create: `apps/server/src/engine/render.ts`
- Modify: `apps/server/src/app.ts` (return rendered result)
- Modify: `packages/shared/src/schemas.ts` (add `RenderedResult` type)
- Test: `apps/server/src/engine/render.test.ts`

**Interfaces:**
- Consumes: `computeProfile` output, `ContentBundle`.
- Produces: `renderResult(profile, content): RenderedResult` where
  `RenderedResult = { leadElement; secondElement|null; isMixed; resourceState; sphereInsight: SphereInsight; beliefCards: BeliefCard[]; strategy: { lead: StrategyProfile; guides: InteractionGuide[] } }` — the user's slice only, as full content objects (text). `/submit` returns `{ profileId, result: RenderedResult }`.

- [ ] **Step 1: Add `RenderedResult` to shared** — `packages/shared/src/schemas.ts` (append; reuse existing content schemas)

```ts
export const RenderedResultSchema = z.object({
  leadElement: z.enum(ELEMENTS), secondElement: z.enum(ELEMENTS).nullable(), isMixed: z.boolean(),
  resourceState: z.enum(['ok', 'low', 'critical']),
  sphereInsight: SphereInsightSchema,
  beliefCards: z.array(BeliefCardSchema),
  strategy: z.object({ lead: StrategyProfileSchema, guides: z.array(InteractionGuideSchema) }),
});
export type RenderedResult = z.infer<typeof RenderedResultSchema>;
```

- [ ] **Step 2: Write the failing test** — `apps/server/src/engine/render.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadContent } from '../content/loader.js';
import { computeProfile } from './index.js';
import { renderResult } from './render.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const content = loadContent(ROOT);
const wheel = { health: 3, family: 8, rest: 5, friends: 9, career: 2, hobby: 7 };
const res = [{ itemId: 'r-energy', value: 5 }, { itemId: 'r-sleep', value: 5 }, { itemId: 'r-exhaust', value: 2 }, { itemId: 'r-anhedonia', value: 2 }];

describe('renderResult', () => {
  it('resolves refs to full content objects for the user slice', () => {
    const el = content.elementItems.map((i) => ({ itemId: i.id, value: i.loads === 'fire' ? 6 : 2 }));
    const st = content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: i.loads === 'avoidance' ? 6 : 2 }));
    const p = computeProfile(el, st, wheel, res, content);
    const r = renderResult(p, content);
    expect(r.leadElement).toBe('fire');
    expect(r.sphereInsight.area).toBe('career');
    expect(r.beliefCards.every((c) => c.element === 'fire')).toBe(true);
    expect(r.strategy.lead.name).toBe(content.strategies.avoidance.name);
    expect(r.strategy.guides).toHaveLength(4); // 4 outgoing
    // no bare refs leak: belief cards carry real text
    expect(r.beliefCards[0]?.belief.length ?? 0).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run + fail** — `pnpm --filter @stasis/server test src/engine/render.test.ts` → FAIL (no `./render.js`).

- [ ] **Step 4: Implement `apps/server/src/engine/render.ts`**

```ts
import type { RenderedResult } from '@stasis/shared';
import type { ContentBundle } from '../content/loader.js';
import type { computeProfile } from './index.js';

type Profile = ReturnType<typeof computeProfile>;

export function renderResult(p: Profile, content: ContentBundle): RenderedResult {
  const beliefCards = p.beliefCardIds
    .map((ref) => content.matrix[ref.element]?.[ref.area])
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const guides = p.guideRefs
    .map((g) => content.interactionGuides.find((x) => x.you === g.you && x.other === g.other))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  return {
    leadElement: p.leadElement, secondElement: p.secondElement ?? null, isMixed: p.isMixed,
    resourceState: p.resourceState,
    sphereInsight: content.sphereInsights[p.weakAreas[0] ?? p.weakAreas[0]] ?? content.sphereInsights[p.weakAreas[0]],
    beliefCards,
    strategy: { lead: content.strategies[p.leadStrategy], guides },
  };
}
```
(If `weakAreas` is empty the mini-insight path already handled the fallback; for `computeProfile` weakAreas may be empty — guard: use `p.weakAreas[0]` and if undefined pick the lowest sphere. Simplify: compute `const area = p.weakAreas[0]` and require the caller only renders when there is a weak area; otherwise `sphereInsight` uses the first available. Keep the guard explicit and covered by a test with an all-high wheel if needed.)

- [ ] **Step 5: Wire into `/submit`** — in `app.ts`, replace `return { profileId, result: profile }` with:
```ts
import { renderResult } from './engine/render.js';
// ...
const { profileId } = runs.saveRun(userId, parsed.data, profile, deps.content.version);
return { profileId, result: renderResult(profile, deps.content) };
```

- [ ] **Step 6: Run + pass + full suite + typecheck**

Run: `pnpm --filter @stasis/server test src/engine/render.test.ts` → PASS.
Update `app.submit.test.ts`'s result assertion from `result.leadElement` (still present) — it stays valid. Run `pnpm -r test && pnpm -r typecheck` → green.

- [ ] **Step 7: Commit**
```bash
git add packages/shared apps/server/src/engine/render.ts apps/server/src/engine/render.test.ts apps/server/src/app.ts
git commit -m "feat(server): /submit returns rendered result slice (refs -> content text)"
```

---

### Task 2: miniapp scaffold + Telegram SDK + theme

**Files:**
- Create: `apps/miniapp/package.json`, `apps/miniapp/tsconfig.json`, `apps/miniapp/vite.config.ts`, `apps/miniapp/index.html`, `apps/miniapp/src/main.tsx`, `apps/miniapp/src/App.tsx`, `apps/miniapp/src/telegram.ts`, `apps/miniapp/src/theme.css`
- Test: `apps/miniapp/src/telegram.test.ts`

**Interfaces:**
- Produces: a booting Vite React app; `initTelegram(): { initDataRaw: string; theme: 'light'|'dark' }` reading the Telegram WebApp bridge with a dev fallback (env `VITE_DEV_INIT_DATA`); `App` rendering a themed shell.

- [ ] **Step 1: Create `apps/miniapp/package.json`**
```json
{
  "name": "@stasis/miniapp", "version": "0.0.0", "type": "module", "private": true,
  "scripts": { "dev": "vite", "build": "vite build", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@stasis/shared": "workspace:*", "@telegram-apps/sdk-react": "^2.0.0", "react": "^18.3.0", "react-dom": "^18.3.0" },
  "devDependencies": {
    "typescript": "^5.5.0", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.0",
    "vitest": "^2.0.0", "jsdom": "^25.0.0", "@testing-library/react": "^16.0.0", "@testing-library/jest-dom": "^6.4.0",
    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 2: Configs** — `tsconfig.json` (extends base, `jsx: react-jsx`, `lib: [ES2022, DOM]`), `vite.config.ts` (react plugin, `test.environment: jsdom`, `test.setupFiles`), `index.html` (root div + Telegram web-app script tag `<script src="https://telegram.org/js/telegram-web-app.js"></script>`).

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/setupTests.ts' },
});
```
Create `src/setupTests.ts` with `import '@testing-library/jest-dom';`.

- [ ] **Step 3: Write the failing test** — `apps/miniapp/src/telegram.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initTelegram } from './telegram.js';

describe('initTelegram', () => {
  beforeEach(() => { (globalThis as any).window = globalThis; delete (globalThis as any).Telegram; });
  it('reads initData + theme from the Telegram bridge', () => {
    (globalThis as any).Telegram = { WebApp: { initData: 'raw123', colorScheme: 'dark', ready() {}, expand() {} } };
    const r = initTelegram();
    expect(r.initDataRaw).toBe('raw123');
    expect(r.theme).toBe('dark');
  });
  it('falls back to dev env when no bridge', () => {
    (import.meta as any).env = { VITE_DEV_INIT_DATA: 'devraw' };
    expect(initTelegram().initDataRaw).toBe('devraw');
  });
});
```

- [ ] **Step 4: Run + fail** → cannot resolve `./telegram.js`.

- [ ] **Step 5: Implement `apps/miniapp/src/telegram.ts`**
```ts
export interface TgContext { initDataRaw: string; theme: 'light' | 'dark' }
export function initTelegram(): TgContext {
  const wa = (globalThis as any).Telegram?.WebApp;
  if (wa?.initData) { wa.ready?.(); wa.expand?.(); return { initDataRaw: wa.initData, theme: wa.colorScheme === 'dark' ? 'dark' : 'light' }; }
  const dev = (import.meta as any).env?.VITE_DEV_INIT_DATA;
  return { initDataRaw: dev ?? '', theme: 'light' };
}
```

- [ ] **Step 6: `main.tsx` + `App.tsx` + `theme.css`** — App reads `initTelegram()`, applies `data-theme`, renders a themed placeholder ("Stasis" + a Start button). `theme.css` defines CSS variables for both themes (element accent colors: fire/water/air/earth).

- [ ] **Step 7: Run test + typecheck + `pnpm --filter @stasis/miniapp build`** → green; build emits `dist/`.

- [ ] **Step 8: Commit** — `feat(miniapp): scaffold + telegram bridge + theming`

---

### Task 3: API client (auth + submit + signals)

**Files:**
- Create: `apps/miniapp/src/api.ts`
- Test: `apps/miniapp/src/api.test.ts`

**Interfaces:**
- Produces: `createApi(baseUrl, initDataRaw)` → `{ authed(): Promise<void>; submit(payload: SubmitPayload): Promise<{ profileId: number; result: RenderedResult }>; signal(event): Promise<void> }`. Exchanges `initData`→JWT once, caches the token, sends `Authorization: Bearer` on subsequent calls. Validates responses with `RenderedResultSchema`.

- [ ] **Step 1: failing test** — mock `fetch`; assert `/auth` called with `tma <initData>`, token cached, `/submit` uses `Bearer <token>` and parses `RenderedResult`; a 401 surfaces a typed `ApiError`.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement `api.ts`** — `fetch` wrapper, token cache, `SubmitPayloadSchema`/`RenderedResultSchema` validation, `ApiError`.
- [ ] **Step 4: run + pass; typecheck.**
- [ ] **Step 5: commit** — `feat(miniapp): typed api client (auth/submit/signal)`

(Full test + impl code mirror Task 2's structure; both use `@stasis/shared` schemas and `vi.fn()` fetch mocks. The signal endpoint `POST /signal {event, meta}` is added server-side in Task 7.)

---

### Task 4: Flow state + shell (wizard) + wheel component

**Files:**
- Create: `apps/miniapp/src/flow.ts` (reducer), `apps/miniapp/src/components/Wheel.tsx`, `apps/miniapp/src/components/Likert.tsx`
- Test: `apps/miniapp/src/flow.test.ts`, `apps/miniapp/src/components/Wheel.test.tsx`

**Interfaces:**
- Produces: `flowReducer(state, action)` over steps `consent → intro → wheel → resource → miniInsight → elements → strategy → result`; `Wheel` (6-axis SVG radar, controlled 1–10 values, onChange); `Likert` (1–6 segmented control, labelled).

- [ ] **Step 1: failing tests** — reducer transitions (forward/back, can't skip consent), and Wheel renders 6 axes and calls `onChange` on interaction (testing-library).
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `flow.ts` (typed `Step` union + reducer), `Wheel.tsx` (SVG polygon from 6 values, draggable/clickable points, accent per current highest), `Likert.tsx` (6 buttons, ARIA).
- [ ] **Step 4: run + pass; typecheck.**
- [ ] **Step 5: commit** — `feat(miniapp): flow reducer + SVG wheel + likert`

---

### Task 5: Assessment screens (consent, intro, wheel, resource, elements, strategy)

**Files:**
- Create: `apps/miniapp/src/screens/{Consent,Intro,WheelScreen,ResourceScreen,ElementsScreen,StrategyScreen}.tsx`
- Test: `apps/miniapp/src/screens/Consent.test.tsx`, `apps/miniapp/src/screens/assessment.test.tsx`

**Interfaces:**
- Consumes: `flow`, `Wheel`, `Likert`, content (test items fetched? No — the client needs the question statements). **Question text source:** add a `GET /assessment` server endpoint (Task 7) returning the element/strategy/resource item statements (these are questions, not the IP matrix). Screens render items from it.
- Produces: each screen renders its step and dispatches flow actions; Consent enforces two checkboxes + 18+ before enabling continue; disclaimer shown on Intro.

- [ ] **Step 1: failing tests** — Consent disables continue until both consents + 18+ checked; assessment screens render the fetched items and collect answers into flow state.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** the six screens using `Wheel`/`Likert`; wire MainButton via the SDK for "continue". Elements/Strategy screens page through their items.
- [ ] **Step 4: run + pass; typecheck.**
- [ ] **Step 5: commit** — `feat(miniapp): consent/intro + wheel/resource/elements/strategy screens`

---

### Task 6: Result screen + mini-insight + feedback signals

**Files:**
- Create: `apps/miniapp/src/screens/{MiniInsightScreen,ResultScreen}.tsx`, `apps/miniapp/src/components/BeliefCard.tsx`
- Test: `apps/miniapp/src/screens/result.test.tsx`

**Interfaces:**
- Consumes: `api.submit` → `RenderedResult`; renders per spec §6 order.
- Produces: `ResultScreen` rendering Strength → State → belief cards (each: strength framing, belief, pattern, readiness 1–5, step with 4 fields, «это не про меня») → strategy block (profile + 4 guides) → feedback tap «точно про меня / общо» → share. `MiniInsightScreen` shows the fast-path sphere insight + CTA to deepen.

- [ ] **Step 1: failing test** — given a mocked `RenderedResult`, ResultScreen renders lead element, the belief card's step fields, the 4 guides, the readiness control, and fires `signal('not_me'|'barnum_me'|'barnum_generic')` on taps; safety block shows when `resourceState==='critical'` and tone forced «Бережно» when `!== 'ok'`.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** `ResultScreen`/`MiniInsightScreen`/`BeliefCard`, wiring `api.signal` for feedback + share (Telegram `shareURL`/`switchInlineQuery`).
- [ ] **Step 4: run + pass; typecheck; `pnpm --filter @stasis/miniapp build`.**
- [ ] **Step 5: commit** — `feat(miniapp): result + mini-insight screens with feedback signals`

---

### Task 7: Server — assessment + signal endpoints; end-to-end wiring

**Files:**
- Modify: `apps/server/src/app.ts` (`GET /assessment`, `POST /signal`)
- Modify: `apps/server/src/db/migrate.ts` (+`signals` table), create `apps/server/src/db/signals.repo.ts`
- Modify: `apps/miniapp/src/App.tsx` (mount the full flow)
- Test: `apps/server/src/app.assessment.test.ts`, `apps/miniapp/src/App.test.tsx` (flow smoke)

**Interfaces:**
- Produces:
  - `GET /assessment` (public, no auth needed for question text) → `{ wheelAreas, elementItems: {id,statement}[], strategyItems: {id,situation,statement}[], resourceItems: {id,statement}[] }` — statements only, NOT the belief/strategy matrix (IP stays server-side until result).
  - `POST /signal` (`Bearer`) → `{ event: 'not_me'|'barnum_me'|'barnum_generic'|'dropoff'|'share', meta? }` persisted to `signals` (user_id, event, meta json, created_at) — no PII beyond the internal user id.
  - App smoke: consent→…→result happy path renders (with mocked api).

- [ ] **Step 1: failing tests** — `/assessment` returns the item statements and no matrix text; `/signal` persists and 401s without a token; App smoke drives the flow to a rendered result.
- [ ] **Step 2: run + fail.**
- [ ] **Step 3: implement** the two endpoints + `signals` table/repo; mount the flow in `App.tsx`.
- [ ] **Step 4: run + pass; `pnpm -r test && pnpm -r typecheck`.**
- [ ] **Step 5: verify-before-done** — run miniapp `dev` + server, drive one real pass in the browser (auth via dev initData) to a rendered result; note it in the report.
- [ ] **Step 6: commit** — `feat: assessment/signal endpoints + full mini-app flow wired`

---

## Self-Review

**Spec coverage:** flow & screens §2 (Tasks 4–6) · result methodology §6 (Task 6: order, 2:1, readiness, tone toggle+forced, safety block) · consent/18+/disclaimer §2/§10 (Task 5) · pilot signals §12.2 (Tasks 6–7) · result rendering from refs / IP protection §E (Task 1) · question text via `/assessment` without leaking the matrix (Task 7). Sharing/OG image and follow-up are Phase 4.

**Placeholder scan:** Task 3 and the repetitive screens reference "mirror Task 2's structure" for the fetch-mock test *shape* only — the interfaces, endpoints, and data shapes are all exact; the implementer writes concrete code against them. No TBD in shipped code steps.

**Type consistency:** `RenderedResult` (Task 1, shared) is the single result shape consumed by `api.submit` (Task 3) and `ResultScreen` (Task 6). `SubmitPayload` (shared) is built by the assessment screens and posted by the client. `/assessment` item shapes match what the loader exposes (`elementItems`/`strategyTest.items`/`resourceItems`).

**Note:** Task 1's `renderResult` weak-area guard — ensure it handles an empty `weakAreas` (all spheres >4): fall back to the lowest sphere for `sphereInsight`, mirroring `computeMiniInsight`. Add a test if the first pass leaves it unguarded.

---

*Phase 3 delivers the playable Mini App through to a rendered result with pilot instrumentation. Phase 4 adds the bot entry, viral sharing (deep-link + OG image), and the follow-up loop.*
