export interface TgContext { initDataRaw: string; theme: 'light' | 'dark' }

export function initTelegram(): TgContext {
  const wa = (globalThis as any).Telegram?.WebApp;
  if (wa?.initData) {
    wa.ready?.();
    wa.expand?.();
    return { initDataRaw: wa.initData, theme: wa.colorScheme === 'dark' ? 'dark' : 'light' };
  }
  // Test override: import.meta.env is resolved once at process start by Vite/Vitest
  // and cannot be mutated per-test, so tests inject the dev fallback via globalThis
  // (the same shared-global mechanism used for the Telegram bridge mock above).
  const dev = (globalThis as any).__VITE_DEV_INIT_DATA__ ?? (import.meta as any).env?.VITE_DEV_INIT_DATA;
  return { initDataRaw: dev ?? '', theme: 'light' };
}
