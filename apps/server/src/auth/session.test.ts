import { describe, it, expect } from 'vitest';
import { issueSession, verifySession, SessionError } from './session.js';

const SECRET = 'test-secret-0123456789';

describe('session', () => {
  it('round-trips userId', () => {
    const token = issueSession(7, SECRET, 3600);
    expect(verifySession(token, SECRET).userId).toBe(7);
  });
  it('rejects a token signed with a different secret', () => {
    const token = issueSession(7, SECRET, 3600);
    expect(() => verifySession(token, 'other-secret')).toThrow(SessionError);
  });
  it('rejects an expired token', () => {
    const token = issueSession(7, SECRET, -1); // already expired
    expect(() => verifySession(token, SECRET)).toThrow(SessionError);
  });
});
