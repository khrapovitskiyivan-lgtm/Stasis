import type { Dispatch } from 'react';
import type { Assessment } from '../api.js';
import { Likert, type LikertValue } from '../components/Likert.js';
import type { FlowAction, FlowState } from '../flow.js';

export interface ElementsScreenProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  assessment: Assessment;
}

export function ElementsScreen({ state, dispatch, assessment }: ElementsScreenProps) {
  const answered = new Map(state.elementAnswers.map((a) => [a.itemId, a.value]));
  const canContinue = assessment.elementItems.every((item) => answered.has(item.id));

  return (
    <div className="screen elements-screen">
      <h1 className="screen-title">Характер</h1>
      <p className="screen-text">Насколько каждое утверждение похоже на вас?</p>
      <div className="assessment-list">
        {assessment.elementItems.map((item) => (
          <div key={item.id} className="assessment-item">
            <p className="assessment-statement">{item.statement}</p>
            <Likert
              value={answered.get(item.id) as LikertValue | undefined}
              onChange={(value) =>
                dispatch({ type: 'answer', axis: 'element', itemId: item.id, value })
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
