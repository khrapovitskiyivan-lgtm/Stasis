import { describe, it, expect } from 'vitest';
import { WheelScoresSchema, SubmitPayloadSchema } from './schemas.js';

describe('WheelScoresSchema', () => {
  it('accepts all six areas within 1..10', () => {
    const ok = { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 };
    expect(WheelScoresSchema.parse(ok)).toEqual(ok);
  });
  it('rejects out-of-range and missing areas', () => {
    expect(() => WheelScoresSchema.parse({ health: 11, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 })).toThrow();
    expect(() => WheelScoresSchema.parse({ health: 3 })).toThrow();
  });
});

describe('SubmitPayloadSchema', () => {
  it('accepts a full payload', () => {
    const p = {
      wheel: { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 },
      elementAnswers: [{ itemId: 'e1', value: 6 }],
      strategyAnswers: [{ itemId: 's1', value: 4 }],
      resourceAnswers: [{ itemId: 'r1', value: 2 }],
    };
    expect(SubmitPayloadSchema.parse(p)).toEqual(p);
  });
  it('rejects a Likert value of 7', () => {
    expect(() => SubmitPayloadSchema.parse({
      wheel: { health: 3, family: 7, rest: 5, friends: 4, career: 3, hobby: 6 },
      elementAnswers: [{ itemId: 'e1', value: 7 }],
      strategyAnswers: [],
      resourceAnswers: [],
    })).toThrow();
  });
});
