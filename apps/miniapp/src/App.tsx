import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
  const [retryNonce, setRetryNonce] = useState(0);
  // Guards the submit to exactly one in-flight attempt; a failure requires an
  // explicit user retry (bumps retryNonce) rather than auto-looping the effect.
  const submitAttempted = useRef(false);

  const [state, dispatch] = useReducer(flowReducer, initialFlow);

  const loadAssessment = useCallback((client: Api) => {
    setLoadError(null);
    client
      .getAssessment()
      .then(setAssessment)
      .catch(() => setLoadError('Не удалось загрузить вопросы.'));
  }, []);

  // Bootstrap: telegram bridge -> api client -> public assessment (no auth needed).
  useEffect(() => {
    const ctx = initTelegram();
    setTheme(ctx.theme);
    const nextApi = createApi(BASE_URL, ctx.initDataRaw);
    setApi(nextApi);
    loadAssessment(nextApi);
  }, [loadAssessment]);

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
    if (state.step !== 'result' || !api || submitAttempted.current) return;
    submitAttempted.current = true; // fire at most once per attempt; no auto-retry loop
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
    // retryNonce is a dependency so an explicit retry (which resets the ref) re-runs this.
  }, [state.step, api, retryNonce]);

  const retrySubmit = useCallback(() => {
    submitAttempted.current = false;
    setSubmitError(null);
    setRetryNonce((n) => n + 1);
  }, []);

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
        content = (
          <div className="screen">
            <p className="screen-text">{submitError}</p>
            <button type="button" className="btn-primary" onClick={retrySubmit}>
              Попробовать ещё раз
            </button>
          </div>
        );
      } else {
        content = <p className="screen-text">Считаем результат…</p>;
      }
      break;
    default:
      content = null;
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {loadError ? (
        <div className="app-load-error">
          <p className="screen-text">{loadError}</p>
          {api ? (
            <button type="button" className="btn-primary" onClick={() => loadAssessment(api)}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}
      {content}
    </div>
  );
}
