import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from './field.js';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('field crypto', () => {
  it('round-trips and rejects tampering', () => {
    const ct = encryptField('секрет', KEY);
    expect(ct).not.toContain('секрет');
    expect(decryptField(ct, KEY)).toBe('секрет');
    expect(() => decryptField(ct.slice(0, -2) + 'ff', KEY)).toThrow();
  });
});
