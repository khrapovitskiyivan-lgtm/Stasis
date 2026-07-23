import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ElementsScreen } from './ElementsScreen.js';
import { ResourceScreen } from './ResourceScreen.js';
import { StrategyScreen } from './StrategyScreen.js';
import { initialFlow } from '../flow.js';
import type { Assessment } from '../api.js';

const assessment: Assessment = {
  wheelAreas: ['health', 'family', 'rest', 'friends', 'career', 'hobby'],
  elementItems: [
    { id: 'e1', statement: 'Я быстро загораюсь новыми идеями.' },
    { id: 'e2', statement: 'Мне важна гармония в отношениях.' },
  ],
  strategyItems: [{ id: 1, situation: 'На встрече с коллегами', statement: 'Я беру инициативу в свои руки.' }],
  resourceItems: [{ id: 'r1', statement: 'В последнее время у меня достаточно сил.' }],
};

describe('ElementsScreen', () => {
  it('renders each element item and dispatches answer(axis: element) on Likert change', () => {
    const dispatch = vi.fn();
    render(<ElementsScreen state={initialFlow} dispatch={dispatch} assessment={assessment} />);

    expect(screen.getByText('Я быстро загораюсь новыми идеями.')).toBeInTheDocument();
    expect(screen.getByText('Мне важна гармония в отношениях.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /продолжить/i })).toBeDisabled();

    const radiogroups = screen.getAllByRole('radiogroup');
    fireEvent.click(within(radiogroups[0]).getAllByRole('radio')[2]); // value 3
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', axis: 'element', itemId: 'e1', value: 3 });
  });

  it('enables continue once every item has an answer', () => {
    const dispatch = vi.fn();
    const state = {
      ...initialFlow,
      elementAnswers: [
        { itemId: 'e1', value: 3 },
        { itemId: 'e2', value: 4 },
      ],
    };
    render(<ElementsScreen state={state} dispatch={dispatch} assessment={assessment} />);
    expect(screen.getByRole('button', { name: /продолжить/i })).not.toBeDisabled();
  });
});

describe('ResourceScreen', () => {
  it('dispatches answer(axis: resource) on Likert change', () => {
    const dispatch = vi.fn();
    render(<ResourceScreen state={initialFlow} dispatch={dispatch} assessment={assessment} />);
    expect(screen.getByText('В последнее время у меня достаточно сил.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', axis: 'resource', itemId: 'r1', value: 1 });
  });
});

describe('StrategyScreen', () => {
  it('shows situation + statement and dispatches answer with s-prefixed itemId', () => {
    const dispatch = vi.fn();
    render(<StrategyScreen state={initialFlow} dispatch={dispatch} assessment={assessment} />);
    expect(screen.getByText('На встрече с коллегами')).toBeInTheDocument();
    expect(screen.getByText('Я беру инициативу в свои руки.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('radio')[5]); // value 6
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', axis: 'strategy', itemId: 's1', value: 6 });
  });
});
