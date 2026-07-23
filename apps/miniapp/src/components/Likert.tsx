export type LikertValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface LikertProps {
  value?: LikertValue;
  onChange: (value: LikertValue) => void;
  minLabel?: string;
  maxLabel?: string;
}

const OPTIONS: LikertValue[] = [1, 2, 3, 4, 5, 6];

export function Likert({ value, onChange, minLabel, maxLabel }: LikertProps) {
  return (
    <div className="likert">
      {minLabel ? <span className="likert-label likert-label-min">{minLabel}</span> : null}
      <div className="likert-options" role="radiogroup" aria-label="Оценка от 1 до 6">
        {OPTIONS.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`likert-option${selected ? ' likert-option-selected' : ''}`}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {maxLabel ? <span className="likert-label likert-label-max">{maxLabel}</span> : null}
    </div>
  );
}
