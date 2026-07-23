import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Wheel } from './Wheel.js';

describe('Wheel', () => {
  it('renders a control for each of the 6 areas', () => {
    render(<Wheel values={{}} onChange={() => {}} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(6);
  });

  it('fires onChange(area, value) when an axis control changes', () => {
    const onChange = vi.fn();
    render(<Wheel values={{ health: 4 }} onChange={onChange} />);
    const healthSlider = screen.getByRole('slider', { name: /health/i });
    fireEvent.change(healthSlider, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith('health', 8);
  });

  it('reflects the current value of each area control', () => {
    render(<Wheel values={{ career: 9 }} onChange={() => {}} />);
    const careerSlider = screen.getByRole('slider', { name: /career/i }) as HTMLInputElement;
    expect(careerSlider.value).toBe('9');
  });
});
