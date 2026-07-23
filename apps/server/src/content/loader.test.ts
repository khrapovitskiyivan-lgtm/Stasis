import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadContent, validateContent, ContentError } from './loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'); // repo root

describe('content loader', () => {
  it('loads and validates the real content bundle', () => {
    const bundle = loadContent(ROOT);
    expect(Object.keys(bundle.sphereInsights)).toHaveLength(6);
    expect(bundle.interactionGuides).toHaveLength(16);
    expect(bundle.strategyTest.items).toHaveLength(16);
    expect(() => validateContent(bundle)).not.toThrow();
    expect(bundle.version).toMatch(/.+/);
  });

  it('rejects forbidden lexicon', () => {
    const bundle = loadContent(ROOT);
    // inject a violation
    (bundle.sphereInsights.health as any).observation = 'это диагноз для тебя';
    expect(() => validateContent(bundle)).toThrow(ContentError);
  });

  it('catches fused medical compounds but clears the benign "увлечение"', () => {
    // the real bundle contains «увлечение» (hobby) and must pass (asserted above);
    // a fused therapy compound must still be caught even without a word boundary.
    const bundle = loadContent(ROOT);
    (bundle.strategies.power as any).gift = 'это психотерапия под видом коучинга';
    expect(() => validateContent(bundle)).toThrow(ContentError);
  });
});
