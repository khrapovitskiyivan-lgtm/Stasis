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
