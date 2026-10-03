import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export type SessionClaims = {
  id?: string;
  scope?: string;
  sessionVersion?: unknown;
  jti?: unknown;
  exp?: unknown;
};

export class InvalidSessionError extends Error {
  constructor() { super('INVALID_SESSION'); }
}

// Match @fastify/jwt's configured Bearer-before-cookie precedence. This is
// needed only for pre-jti JWTs; new sessions are identified by their jti.
function presentedToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization && /^Bearer\s/i.test(authorization)) {
    const parts = authorization.split(' ');
    return parts.length === 2 ? parts[1] : undefined;
  }
  return request.cookies?.token;
}

export function sessionTokenHash(request: FastifyRequest, claims: SessionClaims): string {
  let identifier: string;
  if (claims.jti === undefined) {
    const token = presentedToken(request);
    if (!token) throw new InvalidSessionError();
    identifier = `legacy-jwt:${token}`;
  } else {
    if (typeof claims.jti !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.jti)) {
      throw new InvalidSessionError();
    }
    identifier = `jti:${claims.jti}`;
  }
  return createHash('sha256').update(identifier).digest('hex');
}

export function sessionExpiry(claims: SessionClaims): Date | null {
  if (claims.exp === undefined) return null; // Legacy signed sessions may lack exp.
  if (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= 0) {
    throw new InvalidSessionError();
  }
  const expiresAt = new Date(claims.exp * 1000);
  if (!Number.isFinite(expiresAt.getTime())) throw new InvalidSessionError();
  return expiresAt;
}
