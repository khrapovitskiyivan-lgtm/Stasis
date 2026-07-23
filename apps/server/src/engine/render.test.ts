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

  it('falls back to the lowest sphere when no area is weak (all-high wheel)', () => {
    const allHigh = { health: 8, family: 8, rest: 8, friends: 8, career: 8, hobby: 7 };
    const el = content.elementItems.map((i) => ({ itemId: i.id, value: i.loads === 'water' ? 6 : 2 }));
    const st = content.strategyTest.items.map((i) => ({ itemId: `s${i.id}`, value: i.loads === 'power' ? 6 : 2 }));
    const p = computeProfile(el, st, allHigh, res, content);
    expect(p.weakAreas).toHaveLength(0); // guard actually exercised
    const r = renderResult(p, content);
    expect(r.sphereInsight.area).toBe('hobby'); // lowest of the all-high wheel
    expect(r.beliefCards).toHaveLength(0); // no weak area -> no belief cards
  });
});
