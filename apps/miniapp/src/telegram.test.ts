import { describe, it, expect, beforeEach } from 'vitest';
import { initTelegram } from './telegram.js';

describe('initTelegram', () => {
  beforeEach(() => { (globalThis as any).window = globalThis; delete (globalThis as any).Telegram; delete (globalThis as any).__VITE_DEV_INIT_DATA__; });
  it('reads initData + theme from the Telegram bridge', () => {
    (globalThis as any).Telegram = { WebApp: { initData: 'raw123', colorScheme: 'dark', ready() {}, expand() {} } };
    const r = initTelegram();
    expect(r.initDataRaw).toBe('raw123');
    expect(r.theme).toBe('dark');
  });
  it('falls back to dev env when no bridge', () => {
    // import.meta.env is resolved once at process start by Vite/Vitest and cannot be
    // mutated per-test (verified: neither direct reassignment, vi.stubEnv, nor
    // vi.resetModules() + dynamic re-import changes it mid-run); only an OS-level env
    // var set before the test process starts propagates. So the dev-fallback override
    // is injected via globalThis here, mirroring how the Telegram bridge is mocked above.
    (globalThis as any).__VITE_DEV_INIT_DATA__ = 'devraw';
    expect(initTelegram().initDataRaw).toBe('devraw');
  });
});
