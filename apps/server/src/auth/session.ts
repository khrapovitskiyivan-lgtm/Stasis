import jwt from 'jsonwebtoken';

export class SessionError extends Error {}

export function issueSession(userId: number, secret: string, ttlSec: number): string {
  return jwt.sign({ uid: userId }, secret, { expiresIn: ttlSec });
}

export function verifySession(token: string, secret: string): { userId: number } {
  try {
    const payload = jwt.verify(token, secret) as { uid: number };
    return { userId: payload.uid };
  } catch (e) {
    throw new SessionError(`invalid session: ${(e as Error).message}`);
  }
}
