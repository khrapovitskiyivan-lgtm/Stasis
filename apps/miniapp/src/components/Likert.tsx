export type LikertValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface LikertProps {
  value?: LikertValue;
  onChange: (value: LikertValue) => void;
  minLabel?: string;
  maxLabel?: string;
  ariaLabel?: string;
  /** Number of points on the scale. 6 for assessment items, 5 for the readiness question (spec §6). */
  max?: 5 | 6;
}

const ALL_OPTIONS: LikertValue[] = [1, 2, 3, 4, 5, 6];

export function Likert({ value, onChange, minLabel, maxLabel, ariaLabel, max = 6 }: LikertProps) {
  const options = ALL_OPTIONS.slice(0, max);
  return (
    <div className="likert">
      {minLabel ? <span className="likert-label likert-label-min">{minLabel}</span> : null}
      <div className="likert-options" role="radiogroup" aria-label={ariaLabel ?? minLabel ?? 'rating'}>
        {options.map((opt) => {
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
