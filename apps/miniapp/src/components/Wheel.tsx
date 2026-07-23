import type { Area, WheelScores } from '@stasis/shared';
import { AREAS } from '@stasis/shared';

export interface WheelProps {
  values: Partial<WheelScores>;
  onChange: (area: Area, value: number) => void;
}

const MIN = 1;
const MAX = 10;
const DEFAULT_VALUE = 5;
const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 24;

function axisAngle(index: number): number {
  // start at the top (-90deg) and go clockwise around 6 axes
  return (Math.PI * 2 * index) / AREAS.length - Math.PI / 2;
}

function pointForValue(index: number, value: number): { x: number; y: number } {
  const angle = axisAngle(index);
  const r = (Math.max(MIN, Math.min(MAX, value)) / MAX) * RADIUS;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

export function Wheel({ values, onChange }: WheelProps) {
  const resolved = AREAS.map((area) => values[area] ?? DEFAULT_VALUE);
  const highestValue = Math.max(...resolved);
  const highestIndex = resolved.indexOf(highestValue);

  const polygonPoints = AREAS.map((area, i) => {
    const { x, y } = pointForValue(i, values[area] ?? DEFAULT_VALUE);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="wheel">
      <svg
        className="wheel-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Колесо баланса"
      >
        {AREAS.map((_, i) => {
          const { x, y } = pointForValue(i, MAX);
          return (
            <line
              key={`axis-${i}`}
              className="wheel-axis-line"
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
            />
          );
        })}
        <polygon className="wheel-polygon" points={polygonPoints} />
        {AREAS.map((area, i) => {
          const { x, y } = pointForValue(i, values[area] ?? DEFAULT_VALUE);
          return (
            <circle
              key={`dot-${area}`}
              className={`wheel-dot${i === highestIndex ? ' wheel-dot-accent' : ''}`}
              cx={x}
              cy={y}
              r={5}
            />
          );
        })}
      </svg>
      <div className="wheel-controls">
        {AREAS.map((area) => (
          <label key={area} className="wheel-control">
            <span className="wheel-control-label">{area}</span>
            <input
              type="range"
              className="wheel-control-range"
              min={MIN}
              max={MAX}
              step={1}
              value={values[area] ?? DEFAULT_VALUE}
              aria-label={area}
              onChange={(e) => onChange(area, Number(e.target.value))}
            />
            <span className="wheel-control-value">{values[area] ?? DEFAULT_VALUE}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
