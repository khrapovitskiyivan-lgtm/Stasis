import type { Dispatch } from 'react';
import { AREAS } from '@stasis/shared';
import { Wheel } from '../components/Wheel.js';
import type { FlowAction, FlowState } from '../flow.js';

export interface WheelScreenProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

export function WheelScreen({ state, dispatch }: WheelScreenProps) {
  const canContinue = AREAS.every((a) => state.wheel[a] != null);

  return (
    <div className="screen wheel-screen">
      <h1 className="screen-title">Колесо баланса</h1>
      <p className="screen-text">
        Оцените, насколько вы удовлетворены каждой сферой жизни — от 1 до 10.
      </p>
      <Wheel
        values={state.wheel}
        onChange={(area, value) => dispatch({ type: 'setWheel', area, value })}
        ariaLabel="Колесо баланса"
      />
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
