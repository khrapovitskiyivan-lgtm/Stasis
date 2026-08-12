import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { CheckinPrompt, Digest, RenderedResult } from '@stasis/shared';
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
  elementState: 'confident',
  resourceState: 'ok',
  sphereInsight: {
    area: 'career',
    observation: 'obs',
    recommendation: { trigger: 't', action: 'a', minThreshold: 'm', doneCriterion: 'd' },
    reflectiveQuestion: 'q',
  },
  beliefCards: [
    {
      element: 'fire',
      area: 'career',
      strengthFraming: 'Ты умеешь зажигать дело энергией.',
      belief: 'Если я не возьму на себя — никто не сделает',
      pattern: 'Ты берёшь на себя лишнее, а потом выгораешь.',
      recommendation: {
        trigger: 'Когда видишь провисающую задачу',
        action: 'Спроси команду, кто берёт её',
        minThreshold: '1 раз в неделю',
        doneCriterion: 'Задача названа с именем ответственного',
      },
      openQuestion: 'Знакомо?',
    },
  ],
  strategy: {
    state: 'confident',
    lead: { name: 'Превосходство', coreDrive: 'c', childhoodLogic: 'l', underStress: 'u', gift: 'g', cost: 'co', growthNudge: 'gn' },
    second: null,
    guides: [],
  },
};

const fixtureCheckinPrompt: CheckinPrompt = { lastStep: null, lastWheel: null };
const fixtureDigest: Digest = { observations: [], nextStep: 'continue', safety: false };

const mockApi = {
  authed: vi.fn().mockResolvedValue(undefined),
  getAssessment: vi.fn().mockResolvedValue(fixtureAssessment),
  submit: vi.fn().mockResolvedValue({ profileId: 1, result: fixtureResult }),
  signal: vi.fn().mockResolvedValue(undefined),
  recordConsent: vi.fn().mockResolvedValue(undefined),
  createShare: vi.fn().mockResolvedValue({ slug: 'abc123', url: 'https://api.test?startapp=abc123' }),
  takeStep: vi.fn().mockResolvedValue(undefined),
  getCheckin: vi.fn().mockResolvedValue(fixtureCheckinPrompt),
  submitCheckin: vi.fn().mockResolvedValue({ digest: fixtureDigest }),
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
  mockApi.recordConsent.mockResolvedValue(undefined);
  mockApi.createShare.mockResolvedValue({ slug: 'abc123', url: 'https://api.test?startapp=abc123' });
  mockApi.takeStep.mockResolvedValue(undefined);
  mockApi.getCheckin.mockResolvedValue(fixtureCheckinPrompt);
  mockApi.submitCheckin.mockResolvedValue({ digest: fixtureDigest });
  delete (globalThis as any).Telegram;
});

async function driveToResult() {
  render(<App />);
  // consent: all 3 checkboxes then continue
  for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
  fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));
  // intro
  fireEvent.click(await screen.findByRole('button', { name: /начать/i }));
  // wheel: set all 6 areas to 7 (not the default 5, so onChange fires).
  // Query sliders by position, not by accessible name, so the labels can be
  // localized (RU) without coupling the flow test to their text.
  const sliders = await screen.findAllByRole('slider');
  AREAS.forEach((_, i) => fireEvent.change(sliders[i], { target: { value: '7' } }));
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

    // consent recording fires once, after auth, with the current doc version
    await waitFor(() => expect(mockApi.recordConsent).toHaveBeenCalledTimes(1));
    expect(mockApi.recordConsent).toHaveBeenCalledWith({
      docVersion: '2026-07-23',
      pdn: true,
      psych: true,
      age18: true,
    });

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

  it('clicking "Поделиться" creates a real share then attempts a native Telegram share with the returned url', async () => {
    const tg = { switchInlineQuery: vi.fn(), openTelegramLink: vi.fn() };
    (globalThis as any).Telegram = { WebApp: tg };

    await driveToResult();
    await screen.findByText(/твой результат/i);

    fireEvent.click(screen.getByRole('button', { name: /поделиться/i }));

    expect(mockApi.signal).toHaveBeenCalledWith('share');
    // profileId comes from api.submit's response, not a placeholder
    await waitFor(() => expect(mockApi.createShare).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(tg.openTelegramLink).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('https://api.test?startapp=abc123'))
      )
    );
  });

  it('clicking "Взять шаг в работу" on a belief card calls api.takeStep(cardRef, stepText)', async () => {
    await driveToResult();
    await screen.findByText(/твой результат/i);

    fireEvent.click(screen.getByRole('button', { name: /взять шаг/i }));

    await waitFor(() =>
      expect(mockApi.takeStep).toHaveBeenCalledWith(
        'fire:career',
        'Спроси команду, кто берёт её'
      )
    );
  });

  it('gates the flow on Intro until the assessment has loaded (Phase-3 dead-end closure)', async () => {
    let resolveAssessment: (a: Assessment) => void = () => {};
    mockApi.getAssessment.mockReturnValueOnce(
      new Promise<Assessment>((resolve) => {
        resolveAssessment = resolve;
      })
    );

    render(<App />);
    for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    const startButton = await screen.findByRole('button', { name: /начать/i });
    expect(startButton).toBeDisabled();

    fireEvent.click(startButton);
    // still gated: the wheel screen never mounts while assessment is null
    expect(screen.queryByRole('slider', { name: /здоровье/i })).not.toBeInTheDocument();

    resolveAssessment(fixtureAssessment);
    await waitFor(() => expect(startButton).not.toBeDisabled());

    fireEvent.click(startButton);
    expect(await screen.findByRole('slider', { name: /здоровье/i })).toBeInTheDocument();
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

// Enters the check-in step directly (bypassing onboarding), mirroring how a
// returning user opens the Mini App from the check-in nudge deep-link:
// getEntryMode() reads Telegram.WebApp.initDataUnsafe.start_param === 'checkin'.
function renderAtCheckin() {
  (globalThis as any).Telegram = {
    WebApp: { initData: 'raw-init-data', initDataUnsafe: { start_param: 'checkin' } },
  };
  render(<App />);
}

describe('Check-in flow', () => {
  it('surfaces the submit error inline and keeps the form on screen when POST /checkin fails', async () => {
    mockApi.submitCheckin.mockRejectedValueOnce(new Error('network'));
    renderAtCheckin();

    const energyGroup = await screen.findByRole('radiogroup', { name: /энерги/i });
    fireEvent.click(within(energyGroup).getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/не удалось отправить чек-ин/i);
    // the form is still there — the user can retry, not stuck on a blank screen
    expect(screen.getByRole('button', { name: /отправить/i })).toBeInTheDocument();
    expect(mockApi.submitCheckin).toHaveBeenCalledTimes(1);
  });

  it('does not fire a second submitCheckin call when the submit button is hit again while the first request is in flight', async () => {
    let resolveSubmit: (v: { digest: Digest }) => void = () => {};
    mockApi.submitCheckin.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );
    renderAtCheckin();

    const energyGroup = await screen.findByRole('radiogroup', { name: /энерги/i });
    fireEvent.click(within(energyGroup).getAllByRole('radio')[0]);
    const submitButton = screen.getByRole('button', { name: /отправить/i });

    fireEvent.click(submitButton);
    expect(mockApi.submitCheckin).toHaveBeenCalledTimes(1);
    // in flight: the button disables, so a second tap must not fire another POST
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);
    expect(mockApi.submitCheckin).toHaveBeenCalledTimes(1);

    resolveSubmit({ digest: fixtureDigest });
    await waitFor(() => expect(mockApi.submitCheckin).toHaveBeenCalledTimes(1));
  });
});
