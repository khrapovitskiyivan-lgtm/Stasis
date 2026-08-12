export interface TgContext { initDataRaw: string; theme: 'light' | 'dark' }

export function initTelegram(): TgContext {
  const wa = (globalThis as any).Telegram?.WebApp;
  if (wa?.initData) {
    wa.ready?.();
    wa.expand?.();
    // Paint the Telegram header/background to match the app's --color-bg so
    // fullscreen has no white flash or mismatched bar. Hex mirrors theme.css.
    const bg = wa.colorScheme === 'dark' ? '#17181a' : '#f7f5f1';
    try { wa.setBackgroundColor?.(bg); } catch { /* pre-6.9 client */ }
    try { wa.setHeaderColor?.(bg); } catch { /* pre-6.9 client */ }
    // App-like fullscreen mobile mode (Bot API 8.0+). Each call is guarded:
    // older clients and Telegram Desktop lack these methods (or throw
    // "unsupported"), and bootstrap must never break — there we just keep the
    // expand()ed full-height view as the fallback.
    try { wa.requestFullscreen?.(); } catch { /* unsupported client → expand() stands */ }
    try { wa.disableVerticalSwipes?.(); } catch { /* pre-7.7 client */ }
    try { wa.lockOrientation?.(); } catch { /* pre-8.0 client */ }
    return { initDataRaw: wa.initData, theme: wa.colorScheme === 'dark' ? 'dark' : 'light' };
  }
  // Dev-only fallback for local/browser runs without the Telegram bridge.
  // The globalThis override is how tests inject a value (import.meta.env is frozen
  // at process start and can't be mutated per-test) — gated behind DEV so it never
  // ships as a runtime-reachable auth override in a production bundle.
  const env = (import.meta as any).env ?? {};
  const dev = env.DEV ? ((globalThis as any).__VITE_DEV_INIT_DATA__ ?? env.VITE_DEV_INIT_DATA) : env.VITE_DEV_INIT_DATA;
  return { initDataRaw: dev ?? '', theme: 'light' };
}

/**
 * Detects whether this session was opened from the check-in nudge deep-link
 * rather than a fresh onboarding run. Bot API callback buttons can't launch
 * a Mini App with an arbitrary URL, so the check-in nudge (apps/server/src/
 * bot/bot.ts) opens a plain web_app button — there is currently no
 * start_param carried through that path. This checks Telegram's
 * `start_param` first (forward-compatible with a future `startapp=checkin`
 * deep link) and falls back to a `?mode=checkin` URL query param, which the
 * web_app button URL can already carry today without server changes.
 */
export function getEntryMode(): 'checkin' | null {
  const wa = (globalThis as any).Telegram?.WebApp;
  if (wa?.initDataUnsafe?.start_param === 'checkin') return 'checkin';
  try {
    const search = (globalThis as any).location?.search ?? '';
    if (new URLSearchParams(search).get('mode') === 'checkin') return 'checkin';
  } catch {
    // no URL/location available (non-browser test env) — no entry mode
  }
  return null;
}
