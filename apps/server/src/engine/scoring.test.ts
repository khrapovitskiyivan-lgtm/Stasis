import { describe, it, expect } from 'vitest';
import { scoreElements, scoreStrategies, scoreResource, weakAreas } from './scoring.js';
import type { ElementItemMeta, StrategyTestItem } from '@stasis/shared';

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

describe('scoreStrategies', () => {
  it('maps s${id}, reverses reverse items, ranks lead/second (golden numbers)', () => {
    const sitems: StrategyTestItem[] = [
      { id: 1, loads: 'power', key: 'direct', situation: '', statement: '' },
      { id: 2, loads: 'power', key: 'direct', situation: '', statement: '' },
      { id: 3, loads: 'avoidance', key: 'direct', situation: '', statement: '' },
      { id: 4, loads: 'avoidance', key: 'reverse', situation: '', statement: '' },
    ];
    const r = scoreStrategies(
      [{ itemId: 's1', value: 6 }, { itemId: 's2', value: 6 }, { itemId: 's3', value: 2 }, { itemId: 's4', value: 1 }],
      sitems,
    );
    expect(r.scores.power).toBe(6);
    expect(r.scores.avoidance).toBe(4); // (2 + (7-1))/2
    expect(r.lead).toBe('power');
    expect(r.second).toBe('avoidance');
  });
});

describe('scoreResource', () => {
  const ritems = [
    { id: 'a', key: 'direct' as const, statement: '' },
    { id: 'b', key: 'direct' as const, statement: '' },
    { id: 'x', key: 'distress' as const, statement: '' },
  ];

  it('flags critical on a peak distress item and pins the mean (distress reverse-scored)', () => {
    const r = scoreResource([{ itemId: 'a', value: 5 }, { itemId: 'x', value: 6 }], [ritems[0], ritems[2]]);
    expect(r.score).toBe(3); // (5 + (7-6))/2 = 3, driven critical by peak distress
    expect(r.state).toBe('critical');
  });

  it('flags critical via the mean path alone (no peak distress)', () => {
    const r = scoreResource([{ itemId: 'a', value: 1 }, { itemId: 'b', value: 1 }], [ritems[0], ritems[1]]);
    expect(r.score).toBe(1);
    expect(r.state).toBe('critical');
  });

  it('flags low when the mean lands in (2.0, 2.5]', () => {
    const r = scoreResource([{ itemId: 'a', value: 2 }, { itemId: 'b', value: 3 }], [ritems[0], ritems[1]]);
    expect(r.score).toBe(2.5);
    expect(r.state).toBe('low');
  });
});
