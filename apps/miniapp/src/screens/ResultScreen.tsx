import { useState } from 'react';
import type { Element, RenderedResult } from '@stasis/shared';
import { BeliefCard } from '../components/BeliefCard.js';

export interface ResultScreenProps {
  result: RenderedResult;
  onSignal: (event: string, meta?: unknown) => void;
  onShare: () => void;
}

type Tone = 'gentle' | 'direct';

const ELEMENT_LABELS: Record<Element, string> = {
  fire: 'Огонь',
  water: 'Вода',
  air: 'Воздух',
  earth: 'Земля',
};

const ELEMENT_STRENGTH_COPY: Record<Element, string> = {
  fire: 'Ты умеешь зажигать дело и вести за собой энергией.',
  water: 'Ты чувствуешь людей и умеешь создавать глубину в отношениях.',
  air: 'Ты видишь связи и умеешь легко переключаться между идеями.',
  earth: 'Ты умеешь выстраивать надёжность и доводить дело до результата.',
};

const RESOURCE_STATE_COPY: Record<RenderedResult['resourceState'], string> = {
  ok: 'Сейчас у тебя достаточно опоры, чтобы пробовать новое.',
  low: 'Ресурс сейчас снижен — двигайся маленькими шагами.',
  critical: 'Ресурс сейчас на нуле — сегодня важнее забота о себе, чем прогресс.',
};

const SAFETY_TEXT =
  'Если сейчас тяжело — вы можете обратиться за поддержкой к специалисту или на линию психологической помощи.';

export function ResultScreen({ result, onSignal, onShare }: ResultScreenProps) {
  const [tone, setTone] = useState<Tone>('gentle');
  const toneLocked = result.resourceState !== 'ok';
  const effectiveTone: Tone = toneLocked ? 'gentle' : tone;

  return (
    <div className={`screen result-screen result-tone-${effectiveTone}`}>
      <h1 className="screen-title">Твой результат</h1>

      <section className="result-section result-strength" aria-label="Сила">
        <h2 className="result-section-title">Сила</h2>
        <p className="screen-text">
          Твоя стихия — {ELEMENT_LABELS[result.leadElement]}. {ELEMENT_STRENGTH_COPY[result.leadElement]}
        </p>
        {result.isMixed && result.secondElement ? (
          <p className="result-second-element">
            Также заметен элемент: {ELEMENT_LABELS[result.secondElement]}.
          </p>
        ) : null}
      </section>

      <div className="result-tone-toggle" role="group" aria-label="Тон подачи">
        <button
          type="button"
          aria-pressed={effectiveTone === 'gentle'}
          className={`result-tone-option${effectiveTone === 'gentle' ? ' result-tone-option-selected' : ''}`}
          onClick={() => setTone('gentle')}
        >
          Бережно
        </button>
        <button
          type="button"
          aria-pressed={effectiveTone === 'direct'}
          disabled={toneLocked}
          className={`result-tone-option${effectiveTone === 'direct' ? ' result-tone-option-selected' : ''}`}
          onClick={() => setTone('direct')}
        >
          Прямо
        </button>
      </div>

      <section className="result-section result-state" aria-label="Состояние">
        <h2 className="result-section-title">Состояние</h2>
        <p className="screen-text">{RESOURCE_STATE_COPY[result.resourceState]}</p>
      </section>

      {result.resourceState === 'critical' ? (
        <div className="safety-block" role="note">
          <p>{SAFETY_TEXT}</p>
        </div>
      ) : null}

      <div className="result-belief-cards">
        {result.beliefCards.map((card, idx) => (
          <BeliefCard
            key={idx}
            card={card}
            onNotMe={(c) => onSignal('not_me', { element: c.element, area: c.area })}
          />
        ))}
      </div>

      <section className="result-section result-strategy" aria-label="Стратегия">
        <h2 className="result-section-title">{result.strategy.lead.name}</h2>
        <p className="screen-text">{result.strategy.lead.gift}</p>
        <p className="screen-text">{result.strategy.lead.cost}</p>
        <p className="screen-text result-growth-nudge">{result.strategy.lead.growthNudge}</p>

        <div className="result-guides">
          {result.strategy.guides.map((guide, idx) => (
            <div key={idx} className="result-guide">
              <p className="result-guide-collision">{guide.collision}</p>
              <ul className="result-guide-howto">
                {guide.howTo.map((step, stepIdx) => (
                  <li key={stepIdx}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="result-feedback">
        <p className="screen-text">Насколько это похоже на тебя?</p>
        <div className="result-feedback-buttons">
          <button type="button" onClick={() => onSignal('barnum_me')}>
            Точно про меня
          </button>
          <button type="button" onClick={() => onSignal('barnum_generic')}>
            Слишком общо
          </button>
        </div>
      </div>

      <button type="button" className="btn-continue" onClick={onShare}>
        Поделиться
      </button>
    </div>
  );
}
