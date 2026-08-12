import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Digest } from '@stasis/shared';
import { CheckinScreen } from './CheckinScreen.js';
import { DigestScreen } from './DigestScreen.js';
import { SAFETY_TEXT } from '../safety.js';

describe('CheckinScreen', () => {
  it('shows the memory line with the prior step text and the four outcome buttons', () => {
    render(
      <CheckinScreen
        lastStep={{ text: 'Напиши одному другу, как дела на самом деле', cardRef: 'water:friends' }}
        lastWheel={null}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText(/напиши одному другу, как дела на самом деле/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /сделал/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /частично/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /не получилось/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /передумал/i })).toBeInTheDocument();
  });

  it('does not show the outcome question when there is no prior step', () => {
    render(<CheckinScreen lastStep={null} lastWheel={null} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /сделал/i })).not.toBeInTheDocument();
  });

  it('submits wheel, energy, stepOutcome, stepRef=null and note=null on save', () => {
    const onSubmit = vi.fn();
    render(
      <CheckinScreen
        lastStep={{ text: 'Прежний шаг', cardRef: 'fire:career' }}
        lastWheel={{ health: 6, family: 6, rest: 6, friends: 6, career: 6, hobby: 6 }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /сделал/i }));

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '8' } });

    const energyGroup = screen.getByRole('radiogroup', { name: /энерги/i });
    fireEvent.click(within(energyGroup).getAllByRole('radio')[2]);

    fireEvent.click(screen.getByRole('button', { name: /отправить/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      wheel: { health: 8, family: 6, rest: 6, friends: 6, career: 6, hobby: 6 },
      energy: 3,
      stepRef: null,
      stepOutcome: 'done',
      note: null,
    });
  });
});

function makeDigest(overrides: Partial<Digest> = {}): Digest {
  return {
    observations: [
      { kind: 'step', outcome: 'done' },
      { kind: 'sphere', area: 'career', delta: -3 },
    ],
    nextStep: 'continue',
    safety: false,
    ...overrides,
  };
}

describe('DigestScreen', () => {
  it('renders copy for a step-outcome observation', () => {
    render(<DigestScreen digest={makeDigest()} onDone={vi.fn()} />);
    expect(screen.getByText(/сделал/i)).toBeInTheDocument();
  });

  it('renders the area label for a sphere observation', () => {
    render(<DigestScreen digest={makeDigest()} onDone={vi.fn()} />);
    expect(screen.getByText(/карьер/i)).toBeInTheDocument();
  });

  it('shows the "make it smaller" CTA when nextStep is "shrink"', () => {
    render(<DigestScreen digest={makeDigest({ nextStep: 'shrink' })} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /меньше/i })).toBeInTheDocument();
  });

  it('when safety is true, renders the safety block and none of the observation lines', () => {
    render(
      <DigestScreen
        digest={makeDigest({
          safety: true,
          observations: [
            { kind: 'step', outcome: 'missed' },
            { kind: 'pattern', area: 'career' },
          ],
        })}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(SAFETY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/не получилось/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/карьер/i)).not.toBeInTheDocument();
  });

  it('calls onDone when the finish button is clicked', () => {
    const onDone = vi.fn();
    render(<DigestScreen digest={makeDigest()} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /готово|продолжить/i }));
    expect(onDone).toHaveBeenCalled();
  });
});
