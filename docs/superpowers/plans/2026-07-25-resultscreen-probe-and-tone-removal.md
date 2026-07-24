# ResultScreen Self-Report Probe + Tone-Toggle Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-axis one-tap self-report probe on indeterminate (`none`/`mixed`) typology axes, and remove the non-functional «Бережно/Прямо» tone toggle.

**Architecture:** A new self-contained `TypologyProbe` component renders one axis's probe and manages its own answered/expanded state, calling a single `onReport(selfReport)` callback. `ResultScreen` mounts two instances (element, strategy) only when that axis is not `confident`, mapping `onReport` to an analytics-only `onSignal('typology_self_report', …)` — the displayed result never changes. The tone toggle, its state, and its dead CSS/tests are deleted.

**Tech Stack:** React + TypeScript (strict, ESM), Vite, Vitest + @testing-library/react. `@stasis/shared` provides `ELEMENTS`/`STRATEGIES`/`Element`/`Strategy`.

**Spec:** `docs/superpowers/specs/2026-07-25-resultscreen-probe-and-tone-removal-design.md`

## Global Constraints

- Scope: `apps/miniapp` ONLY. No engine, server, DB, content-YAML, or `packages/shared` contract-schema changes.
- ESM everywhere; import sibling modules with an explicit `.js` extension.
- Signal contract (exact): `onSignal('typology_self_report', { axis: 'element' | 'strategy', measured: 'none' | 'mixed', selfReport: 'balanced' | <element key> | <strategy key> })`. Analytics-only; the result is NOT overridden.
- The probe renders ONLY when an axis is `none` OR `mixed`, per-axis, independently. Never on `confident`.
- «Выраженной нет — я довольно гибкий(ая)» is a first-class primary option (not a consolation).
- Remove the tone toggle entirely; the word «Бережно» disappears (no replacement).
- New user-facing strings must avoid the forbidden lexicon (диагноз/лечени/терапи/гаранти/расстройств).
- Run miniapp tests with `pnpm --filter @stasis/miniapp test`. **Do NOT set `VITE_POLICY_URL`/`VITE_OFFER_URL` in the shell during tests** — it makes `Consent.test.tsx` fail (tests read `apps/miniapp/.env.test`).

---

### Task 1: `TypologyProbe` component

A self-contained probe for one axis. TDD via its own test.

**Files:**
- Create: `apps/miniapp/src/components/TypologyProbe.tsx`
- Test: `apps/miniapp/src/components/TypologyProbe.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface ProbeOption { value: string; label: string }
  export interface TypologyProbeProps {
    axisLabel: string;                       // "Стихия" | "Стратегия"
    options: ProbeOption[];                  // 4 chips: {value: type key, label: RU name}
    onReport: (selfReport: string) => void;  // 'balanced' | a type key
  }
  export function TypologyProbe(props: TypologyProbeProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/src/components/TypologyProbe.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypologyProbe } from './TypologyProbe.js';

const OPTIONS = [
  { value: 'fire', label: 'Огонь' },
  { value: 'water', label: 'Вода' },
  { value: 'air', label: 'Воздух' },
  { value: 'earth', label: 'Земля' },
];

describe('TypologyProbe', () => {
  it('reports "balanced" when the "no dominant type" button is clicked', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стихия" options={OPTIONS} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /выраженной нет/i }));
    expect(onReport).toHaveBeenCalledWith('balanced');
  });

  it('expands to chips and reports the chosen type key', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стихия" options={OPTIONS} onReport={onReport} />);
    // chips are not shown until the user opts into "I'm more one type"
    expect(screen.queryByRole('button', { name: /^вода$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /я скорее одна/i }));
    fireEvent.click(screen.getByRole('button', { name: /^вода$/i }));
    expect(onReport).toHaveBeenCalledWith('water');
  });

  it('collapses to a thank-you after answering and cannot fire twice', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стратегия" options={OPTIONS} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /выраженной нет/i }));
    expect(screen.getByText(/спасибо/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /выраженной нет/i })).not.toBeInTheDocument();
    expect(onReport).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @stasis/miniapp test -- TypologyProbe`
Expected: FAIL — module `./TypologyProbe.js` not found.

- [ ] **Step 3: Write the component**

Create `apps/miniapp/src/components/TypologyProbe.tsx`:

```tsx
import { useState } from 'react';

export interface ProbeOption {
  value: string;
  label: string;
}

export interface TypologyProbeProps {
  axisLabel: string;
  options: ProbeOption[];
  onReport: (selfReport: string) => void;
}

export function TypologyProbe({ axisLabel, options, onReport }: TypologyProbeProps) {
  const [answered, setAnswered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (answered) {
    return (
      <div className="typology-probe typology-probe-done" role="note">
        <p className="screen-text">Спасибо.</p>
      </div>
    );
  }

  const report = (value: string) => {
    setAnswered(true);
    onReport(value);
  };

  return (
    <div className="typology-probe" role="group" aria-label={`Самоотчёт: ${axisLabel}`}>
      <p className="screen-text">{axisLabel} вышла неоднозначной — а как тебе самому кажется?</p>
      {expanded ? (
        <div className="typology-probe-chips">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="typology-probe-chip"
              onClick={() => report(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="typology-probe-actions">
          <button type="button" className="typology-probe-option" onClick={() => report('balanced')}>
            Выраженной нет — я довольно гибкий(ая)
          </button>
          <button type="button" className="typology-probe-option" onClick={() => setExpanded(true)}>
            Я скорее одна…
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @stasis/miniapp test -- TypologyProbe`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/src/components/TypologyProbe.tsx apps/miniapp/src/components/TypologyProbe.test.tsx
git commit -m "feat(miniapp): TypologyProbe — one-tap per-axis self-report component"
```

---

### Task 2: Wire probes into ResultScreen; remove the tone toggle

**Files:**
- Modify: `apps/miniapp/src/screens/ResultScreen.tsx`
- Modify: `apps/miniapp/src/theme.css`
- Test: `apps/miniapp/src/screens/result.test.tsx`
- Modify: `SPEC_CHANGELOG.md`

**Interfaces:**
- Consumes: `TypologyProbe` (Task 1); `ELEMENTS`/`STRATEGIES`/`Element`/`Strategy` from `@stasis/shared`.

- [ ] **Step 1: Update result.test.tsx — remove tone tests, add probe-wiring + tone-absence tests**

In `apps/miniapp/src/screens/result.test.tsx`, DELETE these two existing tests verbatim (they assert the removed toggle):
```tsx
  it('defaults tone to "Бережно" and allows "Прямо" when resourceState is "ok"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'ok' })} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.getByRole('button', { name: /бережно/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /прямо/i })).not.toBeDisabled();
  });

  it('forces and disables "Прямо" tone when resourceState is not "ok"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'low' })} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.getByRole('button', { name: /бережно/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /прямо/i })).toBeDisabled();
  });
```

Then ADD these tests inside the `describe('ResultScreen', …)` block:
```tsx
  it('has no tone toggle (Бережно/Прямо removed)', () => {
    render(<ResultScreen result={makeResult()} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /бережно/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^прямо$/i })).not.toBeInTheDocument();
  });

  it('shows no self-report probe when both axes are confident', () => {
    render(<ResultScreen result={makeResult()} onSignal={vi.fn()} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    expect(screen.queryByText(/а как тебе самому кажется/i)).not.toBeInTheDocument();
  });

  it('element probe: "balanced" fires typology_self_report for the element axis', () => {
    const onSignal = vi.fn();
    render(<ResultScreen result={makeResult({ elementState: 'none', secondElement: 'water' })}
      onSignal={onSignal} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    const probe = screen.getByRole('group', { name: /самоотчёт: стихия/i });
    fireEvent.click(within(probe).getByRole('button', { name: /выраженной нет/i }));
    expect(onSignal).toHaveBeenCalledWith('typology_self_report', {
      axis: 'element', measured: 'none', selfReport: 'balanced',
    });
  });

  it('element probe: choosing a chip fires the element key', () => {
    const onSignal = vi.fn();
    render(<ResultScreen result={makeResult({ elementState: 'mixed', secondElement: 'water' })}
      onSignal={onSignal} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    const probe = screen.getByRole('group', { name: /самоотчёт: стихия/i });
    fireEvent.click(within(probe).getByRole('button', { name: /я скорее одна/i }));
    fireEvent.click(within(probe).getByRole('button', { name: /^вода$/i }));
    expect(onSignal).toHaveBeenCalledWith('typology_self_report', {
      axis: 'element', measured: 'mixed', selfReport: 'water',
    });
  });

  it('strategy probe: fires typology_self_report for the strategy axis', () => {
    const onSignal = vi.fn();
    const base = makeResult();
    const r = makeResult({ strategy: { state: 'none', lead: base.strategy.lead, second: null, guides: [] } });
    render(<ResultScreen result={r} onSignal={onSignal} onShare={vi.fn()} onTakeStep={vi.fn()} />);
    const probe = screen.getByRole('group', { name: /самоотчёт: стратегия/i });
    fireEvent.click(within(probe).getByRole('button', { name: /я скорее одна/i }));
    fireEvent.click(within(probe).getByRole('button', { name: /^уклонение$/i }));
    expect(onSignal).toHaveBeenCalledWith('typology_self_report', {
      axis: 'strategy', measured: 'none', selfReport: 'avoidance',
    });
  });
```

(`within` is already imported at the top of this file.)

- [ ] **Step 2: Run the updated tests to verify the new ones fail**

Run: `pnpm --filter @stasis/miniapp test -- result`
Expected: FAIL — the probe tests can't find the probe group; the tone-absence test may already pass. (The two deleted tone tests are gone.)

- [ ] **Step 3: Edit ResultScreen.tsx — imports, labels, remove tone state**

In `apps/miniapp/src/screens/ResultScreen.tsx`:

(a) Replace the top imports block:
```tsx
import type { BeliefCard as BeliefCardData, Element, RenderedResult, Strategy } from '@stasis/shared';
import { ELEMENTS, STRATEGIES } from '@stasis/shared';
import { BeliefCard } from '../components/BeliefCard.js';
import { SAFETY_TEXT } from '../safety.js';
import { TypologyProbe } from '../components/TypologyProbe.js';
```
(This DROPS `import { useState } from 'react';` — no longer used — and the `type Tone` line below.)

(b) Delete the `type Tone = 'gentle' | 'direct';` line.

(c) Add a strategy label map next to `ELEMENT_LABELS`:
```tsx
const STRATEGY_LABELS: Record<Strategy, string> = {
  power: 'Власть',
  attention: 'Внимание',
  superiority: 'Превосходство',
  avoidance: 'Уклонение',
};
```

(d) Replace the function body opening (state + wrapper) — from `export function ResultScreen(` down to the opening `<div className={...}>` — with:
```tsx
export function ResultScreen({ result, onSignal, onShare, onTakeStep }: ResultScreenProps) {
  return (
    <div className="screen result-screen">
```
(This removes `const [tone, setTone] = useState<Tone>('gentle');`, `toneLocked`, `effectiveTone`, and the tone-dependent wrapper class.)

- [ ] **Step 4: Edit ResultScreen.tsx — delete the tone toggle, add the two probes**

(a) DELETE the entire tone-toggle block:
```tsx
      <div className="result-tone-toggle" role="group" aria-label="Тон подачи">
        <button
          type="button"
          aria-pressed={effectiveTone === 'gentle'}
          className={`result-tone-option${effectiveTone === 'gentle' ? ' result-tone-option-selected' : ''}`}
          onClick={() => setTone('gentle')}
        >
          Бережно
        </button>
        <button
          type="button"
          aria-pressed={effectiveTone === 'direct'}
          disabled={toneLocked}
          className={`result-tone-option${effectiveTone === 'direct' ? ' result-tone-option-selected' : ''}`}
          onClick={() => setTone('direct')}
        >
          Прямо
        </button>
      </div>
```

(b) Immediately AFTER the closing `</section>` of the `result-strength` section (the «Сила» block), insert the element probe:
```tsx
      {result.elementState !== 'confident' ? (
        <TypologyProbe
          axisLabel="Стихия"
          options={ELEMENTS.map((e) => ({ value: e, label: ELEMENT_LABELS[e] }))}
          onReport={(selfReport) =>
            onSignal('typology_self_report', { axis: 'element', measured: result.elementState, selfReport })
          }
        />
      ) : null}
```

(c) After the whole strategy block (the `{result.strategy.state === 'none' ? (…) : (…)}` conditional — right after its closing `)}`), insert the strategy probe:
```tsx
      {result.strategy.state !== 'confident' ? (
        <TypologyProbe
          axisLabel="Стратегия"
          options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABELS[s] }))}
          onReport={(selfReport) =>
            onSignal('typology_self_report', { axis: 'strategy', measured: result.strategy.state, selfReport })
          }
        />
      ) : null}
```

- [ ] **Step 5: Run the result tests to verify they pass**

Run: `pnpm --filter @stasis/miniapp test -- result`
Expected: PASS. If a probe isn't found, check the insertion points and the `axisLabel` strings match the `getByRole('group', { name: /самоотчёт: … /i })` queries.

- [ ] **Step 6: Edit theme.css — add probe styles, remove tone CSS**

In `apps/miniapp/src/theme.css`:

(a) DELETE these rules (the tone toggle + its box styling):
```css
.result-tone-toggle { … }
.result-tone-option { … }
.result-tone-option-selected { … }
.result-tone-option:disabled { … }
.result-tone-gentle .result-strength { … }
.result-tone-direct .result-strength { … }
```
(Delete each rule in full. `.result-strength` reverts to the default `.result-section` styling — do NOT port the box look onto it.)

(b) ADD probe styles (place near the other `.result-*` rules):
```css
.typology-probe {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 0.75rem;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
}

.typology-probe-actions,
.typology-probe-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.typology-probe-option,
.typology-probe-chip {
  appearance: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  font-size: 0.85rem;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.typology-probe-option:hover,
.typology-probe-chip:hover {
  transform: translateY(-1px);
  border-color: var(--color-accent);
}

.typology-probe-done {
  opacity: 0.7;
}
```

- [ ] **Step 7: Run the full miniapp suite**

Run: `pnpm --filter @stasis/miniapp test`
Expected: PASS (all files). Confirm no leftover reference to `tone`/`effectiveTone` breaks the typecheck (`grep -rn "effectiveTone\|setTone\|toneLocked" apps/miniapp/src` → no matches).

- [ ] **Step 8: Record in SPEC_CHANGELOG.md**

Append:
```markdown
## 2026-07-25 — ResultScreen: self-report probe + tone-toggle removal
- Added `TypologyProbe`: a per-axis one-tap self-report shown only when an axis is `none`/`mixed` (element and strategy judged independently). Fires analytics-only `onSignal('typology_self_report', { axis, measured, selfReport∈{balanced|type-key} })`; never overrides the measured result. The «Выраженной нет — я гибкий(ая)» option is first-class. Rationale: cheap signal-vs-noise data before considering adaptive items (per the psychometrics consult).
- Removed the non-functional «Бережно/Прямо» tone toggle (it only restyled a border, never changed copy) and its dead CSS/tests.
```

- [ ] **Step 9: Commit**

```bash
git add apps/miniapp/src/screens/ResultScreen.tsx apps/miniapp/src/screens/result.test.tsx apps/miniapp/src/theme.css SPEC_CHANGELOG.md
git commit -m "feat(miniapp): per-axis self-report probe; remove tone toggle"
```

---

## Notes

- The probe is deliberately fire-and-forget: `TypologyProbe` owns its answered state, so a duplicate signal is impossible after the first tap. `onSignal` is best-effort (same as `barnum_me`/`not_me`); a failed signal must not affect the result screen.
- `measured` in the payload is the axis's own state (`result.elementState` / `result.strategy.state`), always `'none'` or `'mixed'` at the point the probe renders (it isn't shown for `confident`).
- No `packages/shared` change: the `signal` event is a free-form `(event: string, meta?: unknown)` call, so the new event name + meta need no schema edit.
