import { useState } from 'react';

export interface ProbeOption {
  value: string;
  label: string;
}

export interface TypologyProbeProps {
  axisLabel: string;
  options: ProbeOption[];
  onReport: (selfReport: string) => void;
}

export function TypologyProbe({ axisLabel, options, onReport }: TypologyProbeProps) {
  const [answered, setAnswered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (answered) {
    return (
      <div className="typology-probe typology-probe-done" role="note" aria-live="polite">
        <p className="screen-text">Спасибо.</p>
      </div>
    );
  }

  const report = (value: string) => {
    setAnswered(true);
    onReport(value);
  };

  return (
    <div className="typology-probe" role="group" aria-label={`Самоотчёт: ${axisLabel}`}>
      <p className="screen-text">{axisLabel} вышла неоднозначной — а как тебе самому кажется?</p>
      {expanded ? (
        <div className="typology-probe-chips">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="typology-probe-chip"
              onClick={() => report(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="typology-probe-actions">
          <button type="button" className="typology-probe-option" onClick={() => report('balanced')}>
            Выраженной нет — я довольно гибкий(ая)
          </button>
          <button type="button" className="typology-probe-option" onClick={() => setExpanded(true)}>
            Я скорее одна…
          </button>
        </div>
      )}
    </div>
  );
}
