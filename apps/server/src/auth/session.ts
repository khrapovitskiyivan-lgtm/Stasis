import jwt from 'jsonwebtoken';

export class SessionError extends Error {}

export function issueSession(userId: number, secret: string, ttlSec: number): string {
  return jwt.sign({ uid: userId }, secret, { algorithm: 'HS256', expiresIn: ttlSec });
}

export function verifySession(token: string, secret: string): { userId: number } {
  let payload: unknown;
  try {
    // Pin the algorithm allowlist to HS256 (defense-in-depth against alg
    // confusion), rather than relying on jsonwebtoken's implicit default.
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (e) {
    throw new SessionError(`invalid session: ${(e as Error).message}`);
  }
  if (typeof payload !== 'object' || payload === null || typeof (payload as { uid?: unknown }).uid !== 'number') {
    throw new SessionError('invalid session: unexpected payload shape');
  }
  return { userId: (payload as { uid: number }).uid };
}
