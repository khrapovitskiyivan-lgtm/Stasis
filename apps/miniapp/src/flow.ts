import type { Area, LikertAnswer, WheelScores } from '@stasis/shared';

export type Step =
  | 'consent'
  | 'intro'
  | 'wheel'
  | 'resource'
  | 'miniInsight'
  | 'elements'
  | 'strategy'
  | 'result'
  | 'checkin';

// The onboarding sequence next/back step through. 'checkin' is deliberately
// excluded: it's a separate entry mode (opened straight from the check-in
// nudge deep-link, see initialFlowForEntry below), not a step in this
// linear assessment — it doesn't use next/back, it swaps its own digest
// view in locally after submit.
export const STEPS: readonly Step[] = [
  'consent',
  'intro',
  'wheel',
  'resource',
  'miniInsight',
  'elements',
  'strategy',
  'result',
];

export interface FlowState {
  step: Step;
  consentGiven: boolean;
  wheel: Partial<WheelScores>;
  elementAnswers: LikertAnswer[];
  strategyAnswers: LikertAnswer[];
  resourceAnswers: LikertAnswer[];
}

export type FlowAxis = 'element' | 'strategy' | 'resource';

export type FlowAction =
  | { type: 'giveConsent' }
  | { type: 'setWheel'; area: Area; value: number }
  | { type: 'answer'; axis: FlowAxis; itemId: string; value: number }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; step: Step };

export const initialFlow: FlowState = {
  step: 'consent',
  consentGiven: false,
  wheel: {},
  elementAnswers: [],
  strategyAnswers: [],
  resourceAnswers: [],
};

/**
 * Entry point for a session opened from the check-in nudge (bot deep-link):
 * lands the reducer straight on the 'checkin' step instead of 'consent',
 * skipping the onboarding sequence entirely. Consent for a returning user
 * was already recorded during onboarding; check-in auth is independent of
 * the client-side consent gate (same as submit()).
 */
export function initialFlowForEntry(mode: 'checkin' | null): FlowState {
  return mode === 'checkin' ? { ...initialFlow, step: 'checkin' } : initialFlow;
}

const AXIS_KEY: Record<FlowAxis, 'elementAnswers' | 'strategyAnswers' | 'resourceAnswers'> = {
  element: 'elementAnswers',
  strategy: 'strategyAnswers',
  resource: 'resourceAnswers',
};

function upsertAnswer(list: LikertAnswer[], itemId: string, value: number): LikertAnswer[] {
  const idx = list.findIndex((a) => a.itemId === itemId);
  if (idx === -1) return [...list, { itemId, value }];
  const next = [...list];
  next[idx] = { itemId, value };
  return next;
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'giveConsent':
      return { ...state, consentGiven: true };

    case 'setWheel':
      return { ...state, wheel: { ...state.wheel, [action.area]: action.value } };

    case 'answer': {
      const key = AXIS_KEY[action.axis];
      return { ...state, [key]: upsertAnswer(state[key], action.itemId, action.value) };
    }

    case 'next': {
      if (state.step === 'consent' && !state.consentGiven) return state;
      const idx = STEPS.indexOf(state.step);
      const nextIdx = Math.min(idx + 1, STEPS.length - 1);
      return { ...state, step: STEPS[nextIdx] };
    }

    case 'back': {
      const idx = STEPS.indexOf(state.step);
      const prevIdx = Math.max(idx - 1, 0);
      return { ...state, step: STEPS[prevIdx] };
    }

    case 'goto':
      // Same consent gate as `next`: can't land on any post-consent step until consent is given.
      if (action.step !== 'consent' && !state.consentGiven) return state;
      return { ...state, step: action.step };

    default:
      return state;
  }
}
