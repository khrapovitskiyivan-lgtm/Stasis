import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RenderedResult } from '@stasis/shared';
import { AREAS } from '@stasis/shared';
import type { Assessment } from './api.js';
import { App } from './App.js';

const fixtureAssessment: Assessment = {
  wheelAreas: [...AREAS],
  elementItems: [{ id: 'e1', statement: 'Я быстро загораюсь новыми идеями.' }],
  strategyItems: [{ id: 1, situation: 'На встрече с коллегами', statement: 'Я беру инициативу в свои руки.' }],
  resourceItems: [{ id: 'r1', statement: 'В последнее время у меня достаточно сил.' }],
};

const fixtureResult: RenderedResult = {
  leadElement: 'fire',
  secondElement: null,
  isMixed: false,
  resourceState: 'ok',
  sphereInsight: {
    area: 'career',
    observation: 'obs',
    recommendation: { trigger: 't', action: 'a', minThreshold: 'm', doneCriterion: 'd' },
    reflectiveQuestion: 'q',
  },
  beliefCards: [],
  strategy: {
    lead: { name: 'Превосходство', coreDrive: 'c', childhoodLogic: 'l', underStress: 'u', gift: 'g', cost: 'co', growthNudge: 'gn' },
    guides: [],
  },
};

const mockApi = {
  authed: vi.fn().mockResolvedValue(undefined),
  getAssessment: vi.fn().mockResolvedValue(fixtureAssessment),
  submit: vi.fn().mockResolvedValue({ profileId: 1, result: fixtureResult }),
  signal: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./api.js', () => ({
  createApi: () => mockApi,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.authed.mockResolvedValue(undefined);
  mockApi.getAssessment.mockResolvedValue(fixtureAssessment);
  mockApi.submit.mockResolvedValue({ profileId: 1, result: fixtureResult });
  mockApi.signal.mockResolvedValue(undefined);
});

async function driveToResult() {
  render(<App />);
  // consent: all 3 checkboxes then continue
  for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
  // intro
  fireEvent.click(await screen.findByRole('button', { name: /начать/i }));
  // wheel: set all 6 areas to 7 (not the default 5, so onChange fires)
  await screen.findByRole('slider', { name: 'health' });
  for (const area of AREAS) {
    fireEvent.change(screen.getByRole('slider', { name: area }), { target: { value: '7' } });
  }
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
  // resource
  await screen.findByText(fixtureAssessment.resourceItems[0].statement);
  fireEvent.click(screen.getAllByRole('radio')[0]);
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
  // miniInsight is skipped -> elements
  await screen.findByText(fixtureAssessment.elementItems[0].statement);
  fireEvent.click(screen.getAllByRole('radio')[2]);
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
  // strategy
  await screen.findByText(fixtureAssessment.strategyItems[0].situation);
  fireEvent.click(screen.getAllByRole('radio')[3]);
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
}

describe('App flow smoke test', () => {
  it('drives consent -> intro -> wheel -> resource -> elements -> strategy -> result with a mocked api', async () => {
    await driveToResult();

    // result: submitted via the mocked api and rendered
    await waitFor(() => expect(mockApi.submit).toHaveBeenCalledTimes(1));
    expect(mockApi.submit.mock.calls[0][0]).toEqual({
      wheel: { health: 7, family: 7, rest: 7, friends: 7, career: 7, hobby: 7 },
      elementAnswers: [{ itemId: 'e1', value: 3 }],
      strategyAnswers: [{ itemId: 's1', value: 4 }],
      resourceAnswers: [{ itemId: 'r1', value: 1 }],
    });
    expect(await screen.findByText(/твой результат/i)).toBeInTheDocument();
    expect(screen.getByText(fixtureResult.strategy.lead.name)).toBeInTheDocument();

    // ResultScreen's onSignal is wired to api.signal
    fireEvent.click(screen.getByRole('button', { name: /точно про меня/i }));
    expect(mockApi.signal).toHaveBeenCalledWith('barnum_me', undefined);
  });

  it('does not auto-retry submit on failure; retries only on explicit user action', async () => {
    mockApi.submit.mockRejectedValueOnce(new Error('network')); // first attempt fails
    await driveToResult();

    await screen.findByText(/не удалось получить результат/i);
    expect(mockApi.submit).toHaveBeenCalledTimes(1);
    // give the effect ample opportunity to (wrongly) loop
    await new Promise((r) => setTimeout(r, 60));
    expect(mockApi.submit).toHaveBeenCalledTimes(1); // no auto-retry loop

    // explicit retry re-submits (default mock now resolves)
    fireEvent.click(screen.getByRole('button', { name: /попробовать ещё раз/i }));
    expect(await screen.findByText(/твой результат/i)).toBeInTheDocument();
    expect(mockApi.submit).toHaveBeenCalledTimes(2);
  });
});
