# ResultScreen: Self-Report Probe + Remove Tone Toggle — Design

**Date:** 2026-07-25
**Status:** Design approved (brainstorm), pending implementation plan
**Scope:** `apps/miniapp` only. No engine, DB, content-YAML, or contract-schema changes.

## Context

Two independent changes to the result screen, both surfaced in focus testing and the
follow-up methodology discussion (backed by a psychometrics consult):

1. **Self-report probe.** After the determinacy gate shipped, an indeterminate axis
   (`elementState`/`strategyState` ∈ {`none`, `mixed`}) is now honest but a UX dead-end.
   The consult's recommendation (and the agreed next step over building adaptive
   questions) is a cheap one-tap self-report that (a) resolves the user's dead-end and
   (b) generates labelled data to later decide, on pilot data, whether `none`/`mixed` is
   a true balanced profile (signal) or measurement noise. It must NOT force a type: the
   "no dominant type is correct" answer is a first-class, attractive option.
2. **Remove the tone toggle.** The «Бережно/Прямо» toggle is a half-feature: it only
   restyles the border/background of the «Сила» block (`theme.css:446-457`) and never
   changes any copy; it is also force-locked to gentle when `resourceState !== 'ok'`. It
   reads as broken. We remove it for now (YAGNI); a real tone feature would require
   authoring two-tone copy and is out of scope. The word «Бережно» disappears with it.

## Feature 1 — Self-report probe

### Trigger & placement
Per-axis, independent. A probe renders **inline, directly under that axis's result
section**, only when the axis state is `none` OR `mixed`. On `confident`: nothing. So a
result shows 0, 1, or 2 probes (element and strategy judged separately).

### UI (`TypologyProbe` component)
Same mechanic for both axes:
- Prompt: «[Стихия / Стратегия] вышла неоднозначной — а как тебе самому кажется?»
- Two primary buttons:
  - **«Выраженной нет — я довольно гибкий(ая)»** — first, framed as a genuine answer
    (not a consolation). This is the "balanced / depends" response.
  - **«Я скорее одна…»** → reveals four chips for that axis:
    - element: Огонь / Вода / Воздух / Земля
    - strategy: Власть / Внимание / Превосходство / Уклонение
- After any answer the probe collapses to a quiet «Спасибо». Fires **once per axis**;
  the displayed result does NOT change (self-report never overrides the measurement).

### Data
A new `/signal` event via the existing `onSignal` path (same as `barnum_me`/`not_me`):

```
onSignal('typology_self_report', {
  axis: 'element' | 'strategy',
  measured: 'none' | 'mixed',
  selfReport: 'balanced' | <element key> | <strategy key>,
})
```

- Type keys come from `@stasis/shared` (`ELEMENTS` / `STRATEGIES`); a client-side
  `STRATEGY_LABELS: Record<Strategy,string>` (Власть/Внимание/Превосходство/Уклонение)
  mirrors the existing `ELEMENT_LABELS` for the chip text.
- **The measured lead is NOT sent from the client** — the client contract exposes the
  strategy lead only by display name, not by key, so sending it would be fragile. The
  signal's `axis` + `measured` + `selfReport` is self-sufficient for the initial
  signal-vs-noise question; richer joins (self-report vs the run's measured lead) are a
  pilot-time analytics concern using the stored run, not part of this feature.
- Analytics-only. No profile write, no DB-schema change, no contract-schema change
  (`signal` meta is a free-form object, as today).

### Component boundary
New `apps/miniapp/src/components/TypologyProbe.tsx` — one clear responsibility (render
one axis's probe, manage its own answered/expanded local state, call a single
`onReport(selfReport)` callback). `ResultScreen` wires two instances (element, strategy)
and maps `onReport` to the `onSignal('typology_self_report', …)` payload.

## Feature 2 — Remove the tone toggle

Delete from `ResultScreen.tsx`: the `tone`/`setTone` state, `toneLocked`,
`effectiveTone`, the `result-tone-${…}` wrapper class, and the `.result-tone-toggle`
button group. Delete the now-dead CSS in `theme.css`: `.result-tone-toggle`,
`.result-tone-option`, `.result-tone-option-selected`, `.result-tone-option:disabled`,
`.result-tone-gentle .result-strength`, `.result-tone-direct .result-strength`. With the
tone classes gone, `.result-strength` reverts to the default `.result-section` styling —
do NOT port the tone-specific box look onto it (the box appearance existed only to
differentiate the two tones). Remove the two tone tests in `result.test.tsx` (`defaults
tone to "Бережно"…`, `forces and disables "Прямо"…`).

## Scope / files

**Touched (all `apps/miniapp`):**
- Create: `src/components/TypologyProbe.tsx`
- Modify: `src/screens/ResultScreen.tsx` (add probes; remove tone toggle + state)
- Modify: `src/theme.css` (probe styles; delete tone CSS)
- Test: `src/screens/result.test.tsx` (probe tests; remove tone tests) and, if a new
  component test is warranted, `src/components/TypologyProbe.test.tsx`

**Not touched:** engine, server, DB, content YAML, `packages/shared`, wheel, consent,
sharing, follow-up.

## Testing

- Probe renders under an axis whose state is `none`; renders under an axis whose state is
  `mixed`; does NOT render for a `confident` axis. (Both axes, independently.)
- Clicking «Выраженной нет…» calls `onSignal('typology_self_report', { axis, measured,
  selfReport: 'balanced' })`.
- Clicking «Я скорее одна…» then a chip calls `onSignal` with `selfReport` = that type's
  key (e.g. `'fire'` / `'avoidance'`).
- After answering, the probe collapses (buttons gone, «Спасибо» shown) and a second click
  cannot fire a duplicate signal.
- The tone toggle is gone: no «Бережно»/«Прямо» buttons render; `result-tone-*` classes
  are absent.
- New copy contains no forbidden lexicon (диагноз/лечени/терапи/гаранти/расстройств).

## SPEC_CHANGELOG

Log: added a per-axis self-report probe on indeterminate (`none`/`mixed`) typology axes —
one-tap `typology_self_report` signal (`axis`, `measured`, `selfReport∈{balanced|type}`),
analytics-only, does not override the result; measured lead joined server-side. Removed
the non-functional «Бережно/Прямо» tone toggle and its dead CSS/tests.

## Out of scope (explicit, per decision)

- Adaptive follow-up questions (deferred behind pilot validation; see the
  determinacy-gate discussion).
- Any engine/threshold change, content-item rewrite, or contract-schema change.
- A "real" tone feature (two-tone copy).
