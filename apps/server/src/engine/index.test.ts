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

  it('falls back to the lowest sphere when none score <=4 (no crash)', () => {
    const allHigh = { health: 9, family: 8, rest: 7, friends: 9, career: 6, hobby: 7 };
    const r = computeMiniInsight(allHigh, res, content);
    expect(r.weakArea).toBe('career'); // lowest at 6, still a valid Area
    expect(content.sphereInsights[r.weakArea]).toBeDefined();
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
    // weak areas are career(2) and health(3); the flagship matrix has fire.career
    // but NOT fire.health, so only the present card is referenced (exclusion pinned).
    expect(p.beliefCardIds).toEqual([{ element: 'fire', area: 'career' }]);
  });
});
