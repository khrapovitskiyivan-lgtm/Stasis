import { useCallback, useEffect, useReducer, useState } from 'react';
import { AREAS, type RenderedResult, type SubmitPayload } from '@stasis/shared';
import { initTelegram } from './telegram.js';
import { createApi, type Api, type Assessment } from './api.js';
import { flowReducer, initialFlow } from './flow.js';
import { Consent } from './screens/Consent.js';
import { Intro } from './screens/Intro.js';
import { WheelScreen } from './screens/WheelScreen.js';
import { ResourceScreen } from './screens/ResourceScreen.js';
import { ElementsScreen } from './screens/ElementsScreen.js';
import { StrategyScreen } from './screens/StrategyScreen.js';
import { ResultScreen } from './screens/ResultScreen.js';

const BASE_URL = ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? '';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [api, setApi] = useState<Api | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderedResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [state, dispatch] = useReducer(flowReducer, initialFlow);

  // Bootstrap: telegram bridge -> api client -> public assessment (no auth needed).
  useEffect(() => {
    const ctx = initTelegram();
    setTheme(ctx.theme);
    const nextApi = createApi(BASE_URL, ctx.initDataRaw);
    setApi(nextApi);
    nextApi
      .getAssessment()
      .then(setAssessment)
      .catch(() => setLoadError('Не удалось загрузить вопросы. Попробуйте перезапустить приложение.'));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Simplification (Task 7): the pre-typology mini-insight is server-authored
  // IP with no dedicated fast-path endpoint yet. Skip straight through so the
  // happy path is consent -> intro -> wheel -> resource -> elements ->
  // strategy -> result. MiniInsightScreen stays in place for that later task.
  useEffect(() => {
    if (state.step === 'miniInsight') dispatch({ type: 'next' });
  }, [state.step]);

  // Landing on 'result' triggers the real submit — the full result (belief
  // matrix, strategy profile, guides) is server-rendered IP and only exists
  // after this call.
  useEffect(() => {
    if (state.step !== 'result' || !api || result || submitting) return;
    if (!AREAS.every((a) => state.wheel[a] != null)) {
      setSubmitError('Не все сферы колеса баланса заполнены.');
      return;
    }
    const payload: SubmitPayload = {
      wheel: state.wheel as SubmitPayload['wheel'],
      elementAnswers: state.elementAnswers,
      strategyAnswers: state.strategyAnswers,
      resourceAnswers: state.resourceAnswers,
    };
    setSubmitting(true);
    setSubmitError(null);
    api
      .submit(payload)
      .then(({ result: r }) => setResult(r))
      .catch(() => setSubmitError('Не удалось получить результат. Попробуйте ещё раз.'))
      .finally(() => setSubmitting(false));
  }, [state.step, state.wheel, state.elementAnswers, state.strategyAnswers, state.resourceAnswers, api, result, submitting]);

  const handleSignal = useCallback(
    (event: string, meta?: unknown) => {
      api?.signal(event, meta);
    },
    [api]
  );

  const handleShare = useCallback(() => {
    api?.signal('share');
    // TODO(Phase 4): real deep-link + OG image sharing (spec §12.3). For now,
    // best-effort native Telegram share only.
    const tg = (globalThis as any).Telegram?.WebApp;
    tg?.switchInlineQuery?.('Stasis');
  }, [api]);

  let content;
  switch (state.step) {
    case 'consent':
      content = <Consent state={state} dispatch={dispatch} />;
      break;
    case 'intro':
      content = <Intro state={state} dispatch={dispatch} />;
      break;
    case 'wheel':
      content = <WheelScreen state={state} dispatch={dispatch} />;
      break;
    case 'resource':
      content = assessment ? (
        <ResourceScreen state={state} dispatch={dispatch} assessment={assessment} />
      ) : (
        <p className="screen-text">Загрузка…</p>
      );
      break;
    case 'miniInsight':
      // Skipped — the effect above advances past this step immediately.
      content = null;
      break;
    case 'elements':
      content = assessment ? (
        <ElementsScreen state={state} dispatch={dispatch} assessment={assessment} />
      ) : (
        <p className="screen-text">Загрузка…</p>
      );
      break;
    case 'strategy':
      content = assessment ? (
        <StrategyScreen state={state} dispatch={dispatch} assessment={assessment} />
      ) : (
        <p className="screen-text">Загрузка…</p>
      );
      break;
    case 'result':
      if (result) {
        content = <ResultScreen result={result} onSignal={handleSignal} onShare={handleShare} />;
      } else if (submitError) {
        content = <p className="screen-text">{submitError}</p>;
      } else {
        content = <p className="screen-text">Считаем результат…</p>;
      }
      break;
    default:
      content = null;
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {loadError ? <p className="screen-text app-load-error">{loadError}</p> : null}
      {content}
    </div>
  );
}
