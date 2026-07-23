import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Likert } from './Likert.js';

describe('Likert', () => {
  it('renders 6 options in a radiogroup', () => {
    render(<Likert onChange={() => {}} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
  });

  it('clicking an option fires onChange(v) and marks it selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Likert value={undefined} onChange={onChange} />);
    const options = screen.getAllByRole('radio');
    fireEvent.click(options[3]); // value 4
    expect(onChange).toHaveBeenCalledWith(4);

    rerender(<Likert value={4} onChange={onChange} />);
    const selected = screen.getAllByRole('radio')[3];
    expect(selected).toHaveAttribute('aria-checked', 'true');
    const others = screen.getAllByRole('radio').filter((_, i) => i !== 3);
    others.forEach((opt) => expect(opt).toHaveAttribute('aria-checked', 'false'));
  });

  it('renders min/max labels when provided', () => {
    render(<Likert onChange={() => {}} minLabel="Не согласен" maxLabel="Согласен" />);
    expect(screen.getByText('Не согласен')).toBeInTheDocument();
    expect(screen.getByText('Согласен')).toBeInTheDocument();
  });
});
