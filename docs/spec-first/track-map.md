# Track map — Spec vs Spike (Spec-First v2 §1)

Test applied to each module: **"Can I fill all 6 spec blocks without guessing anything?"** Yes → Spec-track. Any block is a guess → Spike-track (resolve uncertainty with a time-boxed spike, then spec by fact).

## Spec-track (spec fully → autonomous build)

| Module | Why known | Status |
|--------|-----------|--------|
| Bot + auth (initData → JWT, /auth, /me) | Standard Telegram Mini App auth pattern | **Built (Phase 1)** |
| Persistence + repositories | CRUD over node:sqlite, known | **Built (Phase 1)** |
| Shared contract (zod) | We define it | **Built (Phase 1)** |
| Balance wheel (6 spheres, 1–10) | Pure UI + scoring | Phase 2/3 |
| Belief engine (element × weak sphere → card) | Deterministic lookup over authored matrix | Phase 2 |
| Content delivery (matrix loader, versioning, CI schema) | File artifact + validation | Phase 2 |
| Mini App flow (consents, wheel, tests, result) | Known screens | Phase 3 |
| Sharing (deep-link, public payload, OG image) | Known Telegram mechanics | Phase 4 |
| Follow-up loop (scheduler, nudge) | Table + periodic tick | Phase 4 |
| Consents / legal / safety block | Requirements known (152-ФЗ) | Phases 2–4 |

These get the full Spec-First treatment: 6-block module specs + stack adapter → autonomous subagent build.

## Spike-track (resolve first, spec by fact — DO NOT spec on a guess)

| Spike | Unknown it resolves | How | Gate |
|-------|--------------------|-----|------|
| **Elements factor structure** | Do 4 elements load as 4 factors, or collapse to 2 axes (S–N, T–F)? Are items reliable (α≥0.70)? | Pilot 150–250 target-audience respondents; EFA (parallel analysis, oblique), α, item-total, retest≥30 | Until answered: keep typology wording maximally probabilistic; **Plan Б** = pivot to 2-axis model (4 quadrants). Do not finalize §3.2 scoring claims. |
| **Strategy discriminant validity** | Do strategy items stay orthogonal to elements (no cross-loading)? Reliable on 16 items? | Same pilot; check strategy↔element correlations | Until answered: strategy shown, but claims humble. Reviewer already checked wording-level orthogonality. |
| **Content resonance ("на зуб")** | Do cards read as "про меня" vs Barnum, and is the step doable? | Show `content/matrix/flagship-cards-test.html` to 5–10 real entrepreneurs; anti-Barnum survey | Gate before authoring the full 24-card matrix. If "общо" dominates → fix core content before build. |

**Rule:** the spec describes the *studied* solution, not the hypothesis. The typology sections of the design spec are provisional until these spikes report. The rest of the product does not depend on the outcome (hero = wheel→belief→step loop), so Spec-track build proceeds in parallel with the spikes.
