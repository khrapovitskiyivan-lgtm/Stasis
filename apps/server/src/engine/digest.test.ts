import { describe, it, expect } from 'vitest';
import { computeDigest } from './digest.js';

const w = (career: number) => ({ health: 5, family: 5, rest: 5, friends: 5, career, hobby: 5 });
const base = { resourceState: 'ok' as const };

describe('computeDigest (deterministic selection)', () => {
  it('always includes the step outcome and a next step', () => {
    const d = computeDigest({ ...base,
      wheels: [{ createdAt: 1, wheel: w(5) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(5), energy: 5, stepRef: 1, stepOutcome: 'done', note: null }],
    }, 3);
    expect(d.observations.some((o) => o.kind === 'step' && o.outcome === 'done')).toBe(true);
    expect(d.nextStep).toBe('new'); // done -> propose a new step
  });

  it('flags a sphere that dropped by >= 2 since last', () => {
    const d = computeDigest({ ...base,
      wheels: [{ createdAt: 1, wheel: w(8) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(5), energy: 5, stepRef: 1, stepOutcome: 'missed', note: null }],
    }, 3);
    expect(d.observations.some((o) => o.kind === 'sphere' && o.area === 'career' && o.delta === -3)).toBe(true);
    expect(d.nextStep).toBe('shrink'); // missed -> offer to shrink
  });

  it('emits a recurring pattern only from the 3rd data point', () => {
    const ck = (createdAt: number) => ({ id: createdAt, userId: 1, createdAt, wheel: w(3), energy: 5, stepRef: 1, stepOutcome: 'missed' as const, note: null });
    const d = computeDigest({ ...base, wheels: [{ createdAt: 1, wheel: w(3) }], checkins: [ck(2), ck(3)] }, 4);
    expect(d.observations.some((o) => o.kind === 'pattern' && o.area === 'career')).toBe(true);
  });

  it('orders the wheel series by createdAt, not by array position, when a retake is interleaved between checkins', () => {
    // A retake (history.wheels entry) lands chronologically BETWEEN two
    // checkins but is concatenated after both in the raw arrays. The naive
    // concat [...wheels, ...checkins] would compare the last two checkins
    // (w(5) -> w(3), delta -2); sorted by createdAt the two chronologically
    // latest wheels are the retake (w(9), createdAt 20) and the second
    // checkin (w(3), createdAt 30), delta -6.
    const d = computeDigest({ ...base,
      wheels: [
        { createdAt: 1, wheel: w(8) },
        { createdAt: 20, wheel: w(9) }, // retake, interleaved after checkin@10, before checkin@30
      ],
      checkins: [
        { id: 1, userId: 1, createdAt: 10, wheel: w(5), energy: 5, stepRef: 1, stepOutcome: 'missed', note: null },
        { id: 2, userId: 1, createdAt: 30, wheel: w(3), energy: 5, stepRef: 1, stepOutcome: 'missed', note: null },
      ],
    }, 40);
    expect(d.observations.some((o) => o.kind === 'sphere' && o.area === 'career' && o.delta === -6)).toBe(true);
    expect(d.observations.some((o) => o.kind === 'sphere' && o.delta === -2)).toBe(false);
  });

  it('routes to safety and emits nothing chipper when resourceState is critical', () => {
    const d = computeDigest({ resourceState: 'critical',
      wheels: [{ createdAt: 1, wheel: w(2) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(2), energy: 1, stepRef: 1, stepOutcome: 'missed', note: null }],
    }, 3);
    expect(d.safety).toBe(true);
  });
});
