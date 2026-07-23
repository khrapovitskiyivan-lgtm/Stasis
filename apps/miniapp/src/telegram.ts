export interface TgContext { initDataRaw: string; theme: 'light' | 'dark' }

export function initTelegram(): TgContext {
  const wa = (globalThis as any).Telegram?.WebApp;
  if (wa?.initData) {
    wa.ready?.();
    wa.expand?.();
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
