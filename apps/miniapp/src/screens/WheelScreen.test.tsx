import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WheelScreen } from './WheelScreen.js';
import { initialFlow } from '../flow.js';

describe('WheelScreen', () => {
  it('disables continue until all 6 areas are set in state.wheel', () => {
    const dispatch = vi.fn();
    const { rerender } = render(<WheelScreen state={initialFlow} dispatch={dispatch} />);
    expect(screen.getByRole('button', { name: /продолжить/i })).toBeDisabled();

    rerender(
      <WheelScreen
        state={{
          ...initialFlow,
          wheel: { health: 5, family: 5, rest: 5, friends: 5, career: 5 },
        }}
        dispatch={dispatch}
      />
    );
    expect(screen.getByRole('button', { name: /продолжить/i })).toBeDisabled();

    rerender(
      <WheelScreen
        state={{
          ...initialFlow,
          wheel: { health: 5, family: 5, rest: 5, friends: 5, career: 5, hobby: 5 },
        }}
        dispatch={dispatch}
      />
    );
    expect(screen.getByRole('button', { name: /продолжить/i })).not.toBeDisabled();
  });

  it('dispatches setWheel when a Wheel slider changes', () => {
    const dispatch = vi.fn();
    render(<WheelScreen state={initialFlow} dispatch={dispatch} />);
    const slider = screen.getByRole('slider', { name: /health/i });
    fireEvent.change(slider, { target: { value: '8' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'setWheel', area: 'health', value: 8 });
  });
});
