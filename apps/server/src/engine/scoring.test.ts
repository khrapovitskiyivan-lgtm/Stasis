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
