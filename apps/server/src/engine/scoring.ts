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
