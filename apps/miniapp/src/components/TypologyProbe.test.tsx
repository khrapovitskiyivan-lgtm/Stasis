import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypologyProbe } from './TypologyProbe.js';

const OPTIONS = [
  { value: 'fire', label: 'Огонь' },
  { value: 'water', label: 'Вода' },
  { value: 'air', label: 'Воздух' },
  { value: 'earth', label: 'Земля' },
];

describe('TypologyProbe', () => {
  it('reports "balanced" when the "no dominant type" button is clicked', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стихия" options={OPTIONS} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /выраженной нет/i }));
    expect(onReport).toHaveBeenCalledWith('balanced');
  });

  it('expands to chips and reports the chosen type key', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стихия" options={OPTIONS} onReport={onReport} />);
    // chips are not shown until the user opts into "I'm more one type"
    expect(screen.queryByRole('button', { name: /^вода$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /я скорее одна/i }));
    fireEvent.click(screen.getByRole('button', { name: /^вода$/i }));
    expect(onReport).toHaveBeenCalledWith('water');
  });

  it('collapses to a thank-you after answering and cannot fire twice', () => {
    const onReport = vi.fn();
    render(<TypologyProbe axisLabel="Стратегия" options={OPTIONS} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /выраженной нет/i }));
    expect(screen.getByText(/спасибо/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /выраженной нет/i })).not.toBeInTheDocument();
    expect(onReport).toHaveBeenCalledTimes(1);
  });
});
