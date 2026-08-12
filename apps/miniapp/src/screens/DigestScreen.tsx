import type { Area, Digest, Observation } from '@stasis/shared';
import { SAFETY_TEXT } from '../safety.js';

export interface DigestScreenProps {
  digest: Digest;
  onDone: () => void;
}

const AREA_LABELS: Record<Area, string> = {
  health: 'Здоровье',
  family: 'Семья',
  rest: 'Отдых',
  friends: 'Друзья',
  career: 'Карьера',
  hobby: 'Увлечения',
};

const STEP_OUTCOME_COPY: Record<'done' | 'partial' | 'missed' | 'changed', string> = {
  done: 'Ты сделал(а) то, что наметил(а) в прошлый раз — это движение вперёд.',
  partial: 'Получилось частично — тоже засчитывается.',
  missed: 'В этот раз не получилось — бывает, идём дальше.',
  changed: 'Планы поменялись — и это нормально.',
};

const NEXT_STEP_COPY: Record<Digest['nextStep'], { title: string; cta: string }> = {
  continue: { title: 'Похоже, темп подходящий — можно продолжать в том же духе.', cta: 'Продолжить' },
  shrink: { title: 'Похоже, шаг был великоват. Есть смысл сделать его меньше.', cta: 'Сделать шаг меньше' },
  new: { title: 'Готовы к следующему шагу.', cta: 'Новый шаг' },
};

function sphereText(area: Area, delta: number): string {
  return delta < 0
    ? `Сфера «${AREA_LABELS[area]}» просела за это время.`
    : `Сфера «${AREA_LABELS[area]}» подросла за это время.`;
}

function patternText(area: Area): string {
  return `Шаги в сфере «${AREA_LABELS[area]}» пока стабильно не даются.`;
}

function observationText(observation: Observation): string {
  switch (observation.kind) {
    case 'step':
      return STEP_OUTCOME_COPY[observation.outcome];
    case 'sphere':
      return sphereText(observation.area, observation.delta);
    case 'pattern':
      return patternText(observation.area);
    case 'energy':
      return observation.delta < 0 ? 'Энергии сейчас поменьше, чем в прошлый раз.' : 'Энергии сейчас побольше, чем в прошлый раз.';
    default:
      return '';
  }
}

export function DigestScreen({ digest, onDone }: DigestScreenProps) {
  const next = NEXT_STEP_COPY[digest.nextStep];

  return (
    <div className="screen digest-screen">
      <h1 className="screen-title">Что заметно</h1>

      {digest.safety ? (
        <div className="safety-block" role="note">
          <p>{SAFETY_TEXT}</p>
        </div>
      ) : (
        <div className="digest-observations">
          {digest.observations.map((observation, idx) => (
            <p key={idx} className="screen-text digest-observation">
              {observationText(observation)}
            </p>
          ))}
        </div>
      )}

      {!digest.safety && (
        <section className="digest-next-step" aria-label="Дальше">
          <p className="screen-text">{next.title}</p>
          <button type="button" className="btn-continue" onClick={onDone}>
            {next.cta}
          </button>
        </section>
      )}
    </div>
  );
}
