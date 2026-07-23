import { useState } from 'react';
import type { Dispatch } from 'react';
import type { FlowAction, FlowState } from '../flow.js';

export interface ConsentProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

// Real legal-copy URLs, configured per deploy. Falls back to '#' (a no-op
// anchor) if unset, e.g. in local dev without a .env — never a fake URL.
const POLICY_URL = ((import.meta as any).env?.VITE_POLICY_URL as string | undefined) ?? '#';
const OFFER_URL = ((import.meta as any).env?.VITE_OFFER_URL as string | undefined) ?? '#';

export function Consent({ dispatch }: ConsentProps) {
  const [pdnConsent, setPdnConsent] = useState(false);
  const [psychConsent, setPsychConsent] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const canContinue = pdnConsent && psychConsent && ageConfirmed;

  return (
    <div className="screen consent-screen">
      <h1 className="screen-title">Прежде чем начать</h1>

      <label className="consent-checkbox">
        <input
          type="checkbox"
          checked={pdnConsent}
          onChange={(e) => setPdnConsent(e.target.checked)}
        />
        <span>
          Я согласен(на) на обработку персональных данных в соответствии с{' '}
          <a href={POLICY_URL} target="_blank" rel="noreferrer">
            Политикой конфиденциальности
          </a>
          .
        </span>
      </label>

      <label className="consent-checkbox">
        <input
          type="checkbox"
          checked={psychConsent}
          onChange={(e) => setPsychConsent(e.target.checked)}
        />
        <span>
          Отдельно даю согласие на обработку данных о моём психологическом состоянии,
          которые я укажу в ходе прохождения теста.
        </span>
      </label>

      <label className="consent-checkbox">
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
        />
        <span>Подтверждаю, что мне исполнилось 18 лет.</span>
      </label>

      <p className="screen-fineprint">
        Продолжая, вы также принимаете условия{' '}
        <a href={OFFER_URL} target="_blank" rel="noreferrer">
          Оферты
        </a>
        .
      </p>

      <button
        type="button"
        className="btn-continue"
        disabled={!canContinue}
        onClick={() => {
          dispatch({ type: 'giveConsent' });
          dispatch({ type: 'next' });
        }}
      >
        Продолжить
      </button>
    </div>
  );
}
