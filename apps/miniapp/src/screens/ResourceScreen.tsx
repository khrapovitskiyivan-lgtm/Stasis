import type { Dispatch } from 'react';
import type { Assessment } from '../api.js';
import { Likert, type LikertValue } from '../components/Likert.js';
import type { FlowAction, FlowState } from '../flow.js';

export interface ResourceScreenProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  assessment: Assessment;
}

export function ResourceScreen({ state, dispatch, assessment }: ResourceScreenProps) {
  const answered = new Map(state.resourceAnswers.map((a) => [a.itemId, a.value]));
  const canContinue = assessment.resourceItems.every((item) => answered.has(item.id));

  return (
    <div className="screen resource-screen">
      <h1 className="screen-title">Ресурс</h1>
      <p className="screen-text">Насколько каждое утверждение верно для вас сейчас?</p>
      <div className="assessment-list">
        {assessment.resourceItems.map((item) => (
          <div key={item.id} className="assessment-item">
            <p className="assessment-statement">{item.statement}</p>
            <Likert
              value={answered.get(item.id) as LikertValue | undefined}
              onChange={(value) =>
                dispatch({ type: 'answer', axis: 'resource', itemId: item.id, value })
              }
              minLabel="Не согласен(на)"
              maxLabel="Согласен(на)"
              ariaLabel={item.statement}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-continue"
        disabled={!canContinue}
        onClick={() => dispatch({ type: 'next' })}
      >
        Продолжить
      </button>
    </div>
  );
}
