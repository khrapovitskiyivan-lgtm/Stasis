import { AREAS, type Area, type WheelScores } from '@stasis/shared';
import type { CheckinRow, StepOutcome } from '../db/checkins.repo.js';

const SPHERE_DELTA_MIN = 2;

export type Observation =
  | { kind: 'step'; outcome: StepOutcome }
  | { kind: 'sphere'; area: Area; delta: number }
  | { kind: 'pattern'; area: Area }
  | { kind: 'energy'; delta: number };

export interface DigestHistory {
  wheels: { createdAt: number; wheel: WheelScores }[];
  checkins: CheckinRow[];
  resourceState: 'ok' | 'low' | 'critical';
}
export interface Digest { observations: Observation[]; nextStep: 'continue' | 'shrink' | 'new'; safety: boolean }

function biggestDrop(prev: WheelScores, curr: WheelScores): { area: Area; delta: number } | null {
  let worst: { area: Area; delta: number } | null = null;
  for (const a of AREAS) {
    const delta = curr[a] - prev[a];
    if (Math.abs(delta) >= SPHERE_DELTA_MIN && (!worst || Math.abs(delta) > Math.abs(worst.delta))) worst = { area: a, delta };
  }
  return worst;
}

// _now reserved for future time-based selection (recency weighting); kept in the
// signature so callers pass it and selection stays a pure function of (data, now).
export function computeDigest(history: DigestHistory, _now: number): Digest {
  const safety = history.resourceState === 'critical';
  const last = history.checkins[history.checkins.length - 1];
  const observations: Observation[] = [];

  if (last?.stepOutcome) observations.push({ kind: 'step', outcome: last.stepOutcome });

  // sphere drift: latest wheel vs the previous snapshot (checkin wheels + the
  // onboarding wheel), ordered by createdAt so an interleaved retake (a new
  // onboarding wheel recorded between check-ins) still compares the two
  // chronologically-latest wheels rather than assuming wheels precede checkins.
  const wheelSeries = [
    ...history.wheels.map((w) => ({ createdAt: w.createdAt, wheel: w.wheel })),
    ...history.checkins.map((c) => ({ createdAt: c.createdAt, wheel: c.wheel })),
  ].sort((a, b) => a.createdAt - b.createdAt);
  if (wheelSeries.length >= 2) {
    const drop = biggestDrop(
      wheelSeries[wheelSeries.length - 2].wheel,
      wheelSeries[wheelSeries.length - 1].wheel
    );
    if (drop) observations.push({ kind: 'sphere', area: drop.area, delta: drop.delta });
  }

  // recurring pattern: same missed/low sphere across the last 2 checkins (needs >= 2 checkins => 3rd data point)
  if (history.checkins.length >= 2) {
    const missed = history.checkins.slice(-2).every((c) => c.stepOutcome === 'missed');
    if (missed) {
      const lowest = AREAS.reduce((lo, a) => (last.wheel[a] < last.wheel[lo] ? a : lo), AREAS[0]);
      observations.push({ kind: 'pattern', area: lowest });
    }
  }

  const nextStep: Digest['nextStep'] =
    last?.stepOutcome === 'done' ? 'new' : last?.stepOutcome === 'missed' ? 'shrink' : 'continue';

  return { observations: observations.slice(0, 3), nextStep, safety };
}
