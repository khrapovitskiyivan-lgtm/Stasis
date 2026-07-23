import { describe, it, expect, vi } from 'vitest';
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

describe('App flow smoke test', () => {
  it('drives consent -> intro -> wheel -> resource -> elements -> strategy -> result with a mocked api', async () => {
    render(<App />);

    // consent: all 3 checkboxes then continue
    for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    // intro
    fireEvent.click(await screen.findByRole('button', { name: /начать/i }));

    // wheel: set all 6 areas then continue (7, not the slider's default of 5,
    // so React actually registers the change and fires onChange)
    await screen.findByRole('slider', { name: 'health' });
    for (const area of AREAS) {
      fireEvent.change(screen.getByRole('slider', { name: area }), { target: { value: '7' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    // resource (assessment-backed)
    await screen.findByText(fixtureAssessment.resourceItems[0].statement);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    // miniInsight is skipped by the container -> lands directly on elements
    await screen.findByText(fixtureAssessment.elementItems[0].statement);
    fireEvent.click(screen.getAllByRole('radio')[2]);
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    // strategy
    await screen.findByText(fixtureAssessment.strategyItems[0].situation);
    fireEvent.click(screen.getAllByRole('radio')[3]);
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

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
});
