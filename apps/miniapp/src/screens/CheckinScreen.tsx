import { useState } from 'react';
import type { CheckinPrompt, CheckinSubmit, WheelScores } from '@stasis/shared';
import { Wheel } from '../components/Wheel.js';
import { Likert, type LikertValue } from '../components/Likert.js';

export type StepOutcome = NonNullable<CheckinSubmit['stepOutcome']>;

export interface CheckinScreenProps {
  lastStep: CheckinPrompt['lastStep'];
  lastWheel: CheckinPrompt['lastWheel'];
  onSubmit: (payload: CheckinSubmit) => void;
  submitting?: boolean;
  submitError?: string | null;
}

const OUTCOME_OPTIONS: { value: StepOutcome; label: string }[] = [
  { value: 'done', label: 'Сделал(а)' },
  { value: 'partial', label: 'Частично' },
  { value: 'missed', label: 'Не получилось' },
  { value: 'changed', label: 'Передумал(а)' },
];

const DEFAULT_WHEEL_VALUE = 5;

export function CheckinScreen({ lastStep, lastWheel, onSubmit, submitting, submitError }: CheckinScreenProps) {
  const [wheel, setWheel] = useState<Partial<WheelScores>>(lastWheel ?? {});
  const [energy, setEnergy] = useState<LikertValue | undefined>(undefined);
  const [outcome, setOutcome] = useState<StepOutcome | null>(null);
  const [note, setNote] = useState('');

  const canSubmit = energy != null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const filledWheel = Object.fromEntries(
      (['health', 'family', 'rest', 'friends', 'career', 'hobby'] as const).map((area) => [
        area,
        wheel[area] ?? DEFAULT_WHEEL_VALUE,
      ])
    ) as WheelScores;
    const payload: CheckinSubmit = {
      wheel: filledWheel,
      energy: energy as number,
      stepRef: null,
      stepOutcome: lastStep ? outcome : null,
      note: note.trim() ? note.trim() : null,
    };
    onSubmit(payload);
  };

  return (
    <div className="screen checkin-screen">
      <h1 className="screen-title">Как продвигается?</h1>

      {lastStep ? (
        <section className="checkin-memory" aria-label="Прошлый шаг">
          <p className="screen-text">В прошлый раз ты решил(а): «{lastStep.text}»</p>
          <div className="checkin-outcome-buttons">
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`checkin-outcome-button${outcome === opt.value ? ' checkin-outcome-button-selected' : ''}`}
                aria-pressed={outcome === opt.value}
                onClick={() => setOutcome(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="screen-text">Прошлого шага не было — просто отметь, как дела сейчас.</p>
      )}

      <section className="checkin-wheel" aria-label="Колесо баланса">
        <h2 className="result-section-title">Колесо баланса сейчас</h2>
        <Wheel
          values={wheel}
          onChange={(area, value) => setWheel((prev) => ({ ...prev, [area]: value }))}
          ariaLabel="Колесо баланса — переоценка"
        />
      </section>

      <section className="checkin-energy" aria-label="Энергия">
        <h2 className="result-section-title">Сколько сил сейчас</h2>
        <Likert
          value={energy}
          onChange={setEnergy}
          max={6}
          minLabel="Мало сил"
          maxLabel="Много сил"
          ariaLabel="Энергия"
        />
      </section>

      <label className="checkin-note">
        <span className="screen-text">Хочешь что-то отметить? (необязательно)</span>
        <textarea
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Заметка"
        />
      </label>

      {submitError ? (
        <p className="screen-text checkin-submit-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <button
        type="button"
        className="btn-continue"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        Отправить
      </button>
    </div>
  );
}
