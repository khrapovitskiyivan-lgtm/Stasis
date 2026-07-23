import { describe, it, expect } from 'vitest';
import { RecommendationSchema, BeliefCardSchema } from './schemas.js';

describe('content schemas', () => {
  it('accepts a full belief card', () => {
    const card = {
      element: 'fire', area: 'career', strengthFraming: 's', belief: 'b', pattern: 'p',
      recommendation: { trigger: 't', action: 'a', minThreshold: 'm', doneCriterion: 'd' },
      openQuestion: 'q',
    };
    expect(BeliefCardSchema.parse(card)).toMatchObject({ element: 'fire' });
  });
  it('rejects a recommendation missing doneCriterion', () => {
    expect(() => RecommendationSchema.parse({ trigger: 't', action: 'a', minThreshold: 'm' })).toThrow();
  });
});
