import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Consent } from './Consent.js';
import { initialFlow } from '../flow.js';

describe('Consent', () => {
  it('disables continue until all three checkboxes are checked', () => {
    const dispatch = vi.fn();
    render(<Consent state={initialFlow} dispatch={dispatch} />);
    const button = screen.getByRole('button', { name: /продолжить/i });
    expect(button).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    fireEvent.click(checkboxes[0]);
    expect(button).toBeDisabled();
    fireEvent.click(checkboxes[1]);
    expect(button).toBeDisabled();
    fireEvent.click(checkboxes[2]);
    expect(button).not.toBeDisabled();
  });

  it('dispatches giveConsent then next when continue is clicked', () => {
    const dispatch = vi.fn();
    render(<Consent state={initialFlow} dispatch={dispatch} />);
    screen.getAllByRole('checkbox').forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'giveConsent' });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'next' });
  });
});
