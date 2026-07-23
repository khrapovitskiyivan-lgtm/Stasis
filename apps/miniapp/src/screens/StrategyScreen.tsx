import type { Dispatch } from 'react';
import type { Assessment } from '../api.js';
import { Likert, type LikertValue } from '../components/Likert.js';
import type { FlowAction, FlowState } from '../flow.js';

export interface StrategyScreenProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  assessment: Assessment;
}

export function StrategyScreen({ state, dispatch, assessment }: StrategyScreenProps) {
  const answered = new Map(state.strategyAnswers.map((a) => [a.itemId, a.value]));
  const canContinue = assessment.strategyItems.every((item) => answered.has(`s${item.id}`));

  return (
    <div className="screen strategy-screen">
      <h1 className="screen-title">Стратегии поведения</h1>
      <p className="screen-text">Представьте себя в описанной ситуации и оцените утверждение.</p>
      <div className="assessment-list">
        {assessment.strategyItems.map((item) => {
          const itemId = `s${item.id}`;
          return (
            <div key={item.id} className="assessment-item">
              <p className="assessment-situation">{item.situation}</p>
              <p className="assessment-statement">{item.statement}</p>
              <Likert
                value={answered.get(itemId) as LikertValue | undefined}
                onChange={(value) =>
                  dispatch({ type: 'answer', axis: 'strategy', itemId, value })
                }
                minLabel="Не согласен(на)"
                maxLabel="Согласен(на)"
                ariaLabel={item.statement}
              />
            </div>
          );
        })}
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
