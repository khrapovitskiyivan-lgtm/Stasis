import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    // Note: vitest's `test.env` config option does NOT propagate into
    // import.meta.env (verified) — Vite builds import.meta.env once from
    // loadEnv()-discovered .env files at config-resolve time, before
    // `test.env` is applied. Fixture values for Consent.tsx's policy/offer
    // links instead live in the committed .env.test (Vite auto-loads
    // .env.[mode] and vitest's default mode is 'test').
  },
});
