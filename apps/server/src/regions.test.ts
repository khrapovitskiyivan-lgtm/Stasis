import { describe, it, expect } from 'vitest';
import { regionConfig } from './regions.js';

describe('regionConfig', () => {
  it('returns RU data residency and crisis-support info', () => {
    const ru = regionConfig('ru');
    expect(ru.dataResidency.length).toBeGreaterThan(0);
    expect(ru.crisisSupport.length).toBeGreaterThan(0);
  });

  it('throws for an unknown region', () => {
    expect(() => regionConfig('xx')).toThrow('unknown region: xx');
  });
});
