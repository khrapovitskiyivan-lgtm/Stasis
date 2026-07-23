import { useState } from 'react';
import type { BeliefCard as BeliefCardData } from '@stasis/shared';
import { Likert, type LikertValue } from './Likert.js';

export interface BeliefCardProps {
  card: BeliefCardData;
  onNotMe: (card: BeliefCardData) => void;
  onTakeStep: (card: BeliefCardData) => void;
}

export function BeliefCard({ card, onNotMe, onTakeStep }: BeliefCardProps) {
  const [readiness, setReadiness] = useState<LikertValue | undefined>(undefined);

  return (
    <div className="belief-card">
      <p className="belief-card-strength">{card.strengthFraming}</p>

      <p className="belief-card-belief">«{card.belief}»</p>

      <p className="belief-card-pattern">{card.pattern}</p>

      <div className="belief-card-readiness">
        <Likert
          value={readiness}
          onChange={setReadiness}
          max={5}
          minLabel="Пока не готов(а)"
          maxLabel="Готов(а)"
          ariaLabel="Насколько хочешь это тронуть"
        />
      </div>

      <div className="belief-card-recommendation">
        <p className="belief-card-field">
          <span className="belief-card-field-label">Триггер:</span> {card.recommendation.trigger}
        </p>
        <p className="belief-card-field">
          <span className="belief-card-field-label">Действие:</span> {card.recommendation.action}
        </p>
        <p className="belief-card-field">
          <span className="belief-card-field-label">Минимум:</span> {card.recommendation.minThreshold}
        </p>
        <p className="belief-card-field">
          <span className="belief-card-field-label">Готово, когда:</span>{' '}
          {card.recommendation.doneCriterion}
        </p>
        {card.recommendation.delegateVariant ? (
          <p className="belief-card-field belief-card-delegate">
            <span className="belief-card-field-label">Можно делегировать:</span>{' '}
            {card.recommendation.delegateVariant}
          </p>
        ) : null}
      </div>

      <p className="belief-card-question">{card.openQuestion}</p>

      <div className="belief-card-actions">
        <button type="button" className="belief-card-take-step" onClick={() => onTakeStep(card)}>
          Взять шаг в работу
        </button>
        <button type="button" className="belief-card-not-me" onClick={() => onNotMe(card)}>
          Это не про меня
        </button>
      </div>
    </div>
  );
}
