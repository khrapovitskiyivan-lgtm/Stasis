import { describe, it, expect } from 'vitest';
import { flowReducer, initialFlow, type FlowState } from './flow.js';

describe('flowReducer', () => {
  it('cannot advance past consent without consentGiven (next is a no-op)', () => {
    const state = flowReducer(initialFlow, { type: 'next' });
    expect(state.step).toBe('consent');
  });

  it('advances from consent to intro after giveConsent + next', () => {
    let state: FlowState = flowReducer(initialFlow, { type: 'giveConsent' });
    expect(state.consentGiven).toBe(true);
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('intro');
  });

  it('moves forward along the ordered STEPS array', () => {
    let state: FlowState = { ...initialFlow, consentGiven: true, step: 'intro' };
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('wheel');
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('resource');
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('miniInsight');
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('elements');
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('strategy');
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('result');
    // no further step beyond result
    state = flowReducer(state, { type: 'next' });
    expect(state.step).toBe('result');
  });

  it('moves backward along the ordered STEPS array', () => {
    let state: FlowState = { ...initialFlow, consentGiven: true, step: 'strategy' };
    state = flowReducer(state, { type: 'back' });
    expect(state.step).toBe('elements');
    // back before the first step is a no-op (stays at first step)
    state = { ...state, step: 'consent' };
    state = flowReducer(state, { type: 'back' });
    expect(state.step).toBe('consent');
  });

  it('goto jumps directly to any step', () => {
    const state = flowReducer(initialFlow, { type: 'goto', step: 'result' });
    expect(state.step).toBe('result');
  });

  it('setWheel updates a single area without touching others', () => {
    let state = flowReducer(initialFlow, { type: 'setWheel', area: 'health', value: 7 });
    expect(state.wheel).toEqual({ health: 7 });
    state = flowReducer(state, { type: 'setWheel', area: 'career', value: 3 });
    expect(state.wheel).toEqual({ health: 7, career: 3 });
    // update existing area
    state = flowReducer(state, { type: 'setWheel', area: 'health', value: 9 });
    expect(state.wheel).toEqual({ health: 9, career: 3 });
  });

  it('answer upserts by itemId (same itemId twice -> one entry, latest value)', () => {
    let state = flowReducer(initialFlow, {
      type: 'answer',
      axis: 'element',
      itemId: 'e1',
      value: 3,
    });
    expect(state.elementAnswers).toEqual([{ itemId: 'e1', value: 3 }]);
    state = flowReducer(state, { type: 'answer', axis: 'element', itemId: 'e2', value: 5 });
    expect(state.elementAnswers).toEqual([
      { itemId: 'e1', value: 3 },
      { itemId: 'e2', value: 5 },
    ]);
    // same itemId again -> upsert, not append
    state = flowReducer(state, { type: 'answer', axis: 'element', itemId: 'e1', value: 6 });
    expect(state.elementAnswers).toEqual([
      { itemId: 'e1', value: 6 },
      { itemId: 'e2', value: 5 },
    ]);
  });

  it('answer keeps strategy and resource axes independent', () => {
    let state = flowReducer(initialFlow, {
      type: 'answer',
      axis: 'strategy',
      itemId: 's1',
      value: 2,
    });
    state = flowReducer(state, { type: 'answer', axis: 'resource', itemId: 'r1', value: 4 });
    expect(state.strategyAnswers).toEqual([{ itemId: 's1', value: 2 }]);
    expect(state.resourceAnswers).toEqual([{ itemId: 'r1', value: 4 }]);
    expect(state.elementAnswers).toEqual([]);
  });
});
