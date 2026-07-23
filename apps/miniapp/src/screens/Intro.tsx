import type { Dispatch } from 'react';
import type { FlowAction, FlowState } from '../flow.js';

export interface IntroProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

export function Intro({ dispatch }: IntroProps) {
  return (
    <div className="screen intro-screen">
      <h1 className="screen-title">Что вас ждёт</h1>
      <p className="screen-text">
        Несколько коротких шагов: колесо баланса жизни, немного вопросов о вашем
        ресурсе, характере и привычных стратегиях — и в конце короткий личный разбор.
      </p>
      <p className="screen-disclaimer">
        Это инструмент саморефлексии, не диагноз и не терапия, не заменяет
        консультацию специалиста.
      </p>
      <button
        type="button"
        className="btn-continue"
        onClick={() => dispatch({ type: 'next' })}
      >
        Начать
      </button>
    </div>
  );
}
