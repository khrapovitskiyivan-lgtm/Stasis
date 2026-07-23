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
