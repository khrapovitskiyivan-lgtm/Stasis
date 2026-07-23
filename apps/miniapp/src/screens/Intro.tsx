import type { Dispatch } from 'react';
import type { FlowAction, FlowState } from '../flow.js';

export interface IntroProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  // Phase-3 dead-end closure: the assessment (wheel areas / element / strategy
  // / resource items) is fetched async on bootstrap. Without this gate, a
  // slow or failed load let the user reach WheelScreen/ResourceScreen with
  // nothing to render and no way forward.
  ready: boolean;
}

export function Intro({ dispatch, ready }: IntroProps) {
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
      {!ready ? <p className="screen-text">Загружаем вопросы…</p> : null}
      <button
        type="button"
        className="btn-continue"
        disabled={!ready}
        onClick={() => dispatch({ type: 'next' })}
      >
        Начать
      </button>
    </div>
  );
}
