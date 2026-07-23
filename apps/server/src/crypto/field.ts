import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keyBuf = (hex: string) => { const b = Buffer.from(hex, 'hex'); if (b.length !== 32) throw new Error('DATA_ENC_KEY must be 32 bytes hex'); return b; };

export function encryptField(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyBuf(keyHex), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), ct.toString('hex')].join(':');
}
export function decryptField(payload: string, keyHex: string): string {
  const [ivH, tagH, ctH] = payload.split(':');
  const d = createDecipheriv('aes-256-gcm', keyBuf(keyHex), Buffer.from(ivH, 'hex'));
  d.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
}
