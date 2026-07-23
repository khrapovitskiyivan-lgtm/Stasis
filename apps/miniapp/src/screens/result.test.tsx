import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { RenderedResult } from '@stasis/shared';
import { ResultScreen } from './ResultScreen.js';
import { MiniInsightScreen } from './MiniInsightScreen.js';

function makeResult(overrides: Partial<RenderedResult> = {}): RenderedResult {
  return {
    leadElement: 'fire',
    secondElement: null,
    isMixed: false,
    resourceState: 'ok',
    sphereInsight: {
      area: 'career',
      observation: 'Ты часто берёшь на себя больше, чем просят.',
      recommendation: {
        trigger: 'Когда чувствуешь, что задача "ничья"',
        action: 'Назови вслух, кто отвечает за результат',
        minThreshold: 'Хотя бы один раз в день',
        doneCriterion: 'Ты произнёс(ла) имя ответственного',
      },
      reflectiveQuestion: 'Что будет, если в этот раз не возьмёшь это на себя?',
    },
    beliefCards: [
      {
        element: 'fire',
        area: 'career',
        strengthFraming: 'Ты умеешь зажигать дело энергией и вести за собой.',
        belief: 'Если я не возьму на себя — никто не сделает',
        pattern: 'Ты берёшь на себя лишнее, а потом выгораешь.',
        recommendation: {
          trigger: 'Когда видишь провисающую задачу',
          action: 'Спроси команду, кто берёт её',
          minThreshold: '1 раз в неделю',
          doneCriterion: 'Задача названа с именем ответственного',
          delegateVariant: 'Назначь ответственного за эту цифру',
        },
        openQuestion: 'Звучит так: «Если я не возьму на себя — никто не сделает». Знакомо?',
      },
      {
        element: 'water',
        area: 'friends',
        strengthFraming: 'Ты чувствуешь людей и создаёшь глубину в отношениях.',
        belief: 'Если я попрошу о помощи — покажу слабость',
        pattern: 'Ты молчишь о своих потребностях, пока не накопится.',
        recommendation: {
          trigger: 'Когда чувствуешь усталость от одиночества',
          action: 'Напиши одному другу, как дела на самом деле',
          minThreshold: '1 сообщение в неделю',
          doneCriterion: 'Сообщение отправлено',
        },
        openQuestion: 'Звучит так: «Если я попрошу о помощи — покажу слабость». Знакомо?',
      },
    ],
    strategy: {
      lead: {
        name: 'Превосходство',
        coreDrive: 'Быть лучшим, компетентным',
        childhoodLogic: 'Ценность = результат',
        underStress: 'Критикует себя и других',
        gift: 'Высокие стандарты и экспертиза',
        cost: 'Трудно просить о помощи, перфекционизм',
        growthNudge: 'Попробуй один раз показать незавершённую работу.',
      },
      guides: [
        {
          you: 'superiority',
          other: 'power',
          collision: 'Ты споришь о качестве, партнёр — о контроле.',
          howTo: ['Назови общую цель до деталей', 'Дай партнёру выбрать способ'],
        },
        {
          you: 'superiority',
          other: 'attention',
          collision: 'Ты фокусируешься на фактах, партнёр — на признании.',
          howTo: ['Отметь вклад партнёра вслух'],
        },
        {
          you: 'superiority',
          other: 'superiority',
          collision: 'Оба соревнуетесь за экспертное мнение.',
          howTo: ['Договоритесь заранее, кто решает в этой теме'],
        },
        {
          you: 'superiority',
          other: 'avoidance',
          collision: 'Ты давишь фактами, партнёр уходит от разговора.',
          howTo: ['Предложи паузу и вернуться к теме позже'],
        },
      ],
    },
    ...overrides,
  };
}

describe('ResultScreen', () => {
  it('renders the lead element strength framing', () => {
    render(<ResultScreen result={makeResult()} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.getByText(/огонь/i)).toBeInTheDocument();
  });

  it('renders each belief card belief text and the 4 recommendation fields', () => {
    const result = makeResult();
    render(<ResultScreen result={result} onSignal={vi.fn()} onShare={vi.fn()} />);

    for (const card of result.beliefCards) {
      expect(
        screen.getAllByText(new RegExp(card.belief.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length
      ).toBeGreaterThan(0);
      expect(screen.getByText(card.recommendation.trigger)).toBeInTheDocument();
      expect(screen.getByText(card.recommendation.action)).toBeInTheDocument();
      expect(screen.getByText(card.recommendation.minThreshold)).toBeInTheDocument();
      expect(screen.getByText(card.recommendation.doneCriterion)).toBeInTheDocument();
    }
    // delegateVariant only present on first card
    expect(screen.getByText(result.beliefCards[0].recommendation.delegateVariant!)).toBeInTheDocument();
  });

  it('renders a readiness Likert control per belief card, on a 1-5 scale (spec §6)', () => {
    const result = makeResult();
    render(<ResultScreen result={result} onSignal={vi.fn()} onShare={vi.fn()} />);
    const readinessGroups = screen.getAllByRole('radiogroup', { name: /тронуть/i });
    expect(readinessGroups).toHaveLength(result.beliefCards.length);
    // readiness is 1-5, not the 6-point assessment scale
    for (const group of readinessGroups) {
      expect(within(group).getAllByRole('radio')).toHaveLength(5);
    }
  });

  it('renders the strategy profile and all 4 guides', () => {
    const result = makeResult();
    render(<ResultScreen result={result} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.getByText(result.strategy.lead.name)).toBeInTheDocument();
    expect(screen.getByText(result.strategy.lead.gift)).toBeInTheDocument();
    expect(screen.getByText(result.strategy.lead.cost)).toBeInTheDocument();
    expect(screen.getByText(result.strategy.lead.growthNudge)).toBeInTheDocument();
    for (const guide of result.strategy.guides) {
      expect(screen.getByText(guide.collision)).toBeInTheDocument();
      for (const step of guide.howTo) {
        expect(screen.getByText(step)).toBeInTheDocument();
      }
    }
  });

  it('fires onSignal("not_me", {element, area}) when a belief card "Это не про меня" is clicked', () => {
    const onSignal = vi.fn();
    const result = makeResult();
    render(<ResultScreen result={result} onSignal={onSignal} onShare={vi.fn()} />);
    const notMeButtons = screen.getAllByRole('button', { name: /это не про меня/i });
    fireEvent.click(notMeButtons[1]);
    expect(onSignal).toHaveBeenCalledWith('not_me', { element: 'water', area: 'friends' });
  });

  it('fires onSignal("barnum_me") / onSignal("barnum_generic") on the feedback tap', () => {
    const onSignal = vi.fn();
    render(<ResultScreen result={makeResult()} onSignal={onSignal} onShare={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /точно про меня/i }));
    expect(onSignal).toHaveBeenCalledWith('barnum_me');
    fireEvent.click(screen.getByRole('button', { name: /общо/i }));
    expect(onSignal).toHaveBeenCalledWith('barnum_generic');
  });

  it('calls onShare when the share button is clicked', () => {
    const onShare = vi.fn();
    render(<ResultScreen result={makeResult()} onSignal={vi.fn()} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: /поделиться/i }));
    expect(onShare).toHaveBeenCalled();
  });

  it('does not show the safety block when resourceState is "ok"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'ok' })} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows the safety block before belief cards when resourceState is "critical"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'critical' })} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/если сейчас тяжело/i)).toBeInTheDocument();
  });

  it('defaults tone to "Бережно" and allows "Прямо" when resourceState is "ok"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'ok' })} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /бережно/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /прямо/i })).not.toBeDisabled();
  });

  it('forces and disables "Прямо" tone when resourceState is not "ok"', () => {
    render(<ResultScreen result={makeResult({ resourceState: 'low' })} onSignal={vi.fn()} onShare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /бережно/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /прямо/i })).toBeDisabled();
  });
});

describe('MiniInsightScreen', () => {
  const sphereInsight = makeResult().sphereInsight;

  it('renders the observation, one recommendation step, and the reflective question', () => {
    render(
      <MiniInsightScreen
        sphereInsight={sphereInsight}
        resourceState="ok"
        onDeepen={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByText(sphereInsight.observation)).toBeInTheDocument();
    expect(screen.getByText(sphereInsight.recommendation.action)).toBeInTheDocument();
    expect(screen.getByText(sphereInsight.reflectiveQuestion)).toBeInTheDocument();
  });

  it('calls onDeepen when the deepen CTA is clicked', () => {
    const onDeepen = vi.fn();
    render(
      <MiniInsightScreen
        sphereInsight={sphereInsight}
        resourceState="ok"
        onDeepen={onDeepen}
        onShare={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /пройти тест/i }));
    expect(onDeepen).toHaveBeenCalled();
  });

  it('calls onShare when the share button is clicked', () => {
    const onShare = vi.fn();
    render(
      <MiniInsightScreen
        sphereInsight={sphereInsight}
        resourceState="ok"
        onDeepen={vi.fn()}
        onShare={onShare}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /поделиться/i }));
    expect(onShare).toHaveBeenCalled();
  });

  it('shows the safety block only when resourceState is "critical"', () => {
    const { rerender } = render(
      <MiniInsightScreen
        sphereInsight={sphereInsight}
        resourceState="ok"
        onDeepen={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    rerender(
      <MiniInsightScreen
        sphereInsight={sphereInsight}
        resourceState="critical"
        onDeepen={vi.fn()}
        onShare={vi.fn()}
      />
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
