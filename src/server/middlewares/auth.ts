import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db.js';
import { InvalidSessionError, sessionExpiry, sessionTokenHash, type SessionClaims } from '../security/session-token.js';

export async function validateActiveSession(request: FastifyRequest, payload: SessionClaims) {
  const tokenVersion = payload.sessionVersion ?? 0;
  if (!payload.id || typeof tokenVersion !== 'number' || !Number.isInteger(tokenVersion) || tokenVersion < 0) {
    throw new InvalidSessionError();
  }
  const tokenHash = sessionTokenHash(request, payload);
  const expiresAt = sessionExpiry(payload);
  // The existing version check and the new per-token revocation check share one
  // database round trip. A database failure rejects authentication.
  const rows = await prisma.$queryRaw<Array<{ sessionVersion: number; revoked: boolean }>>`
    SELECT u."sessionVersion", EXISTS (
      SELECT 1 FROM "revoked_session_tokens" r
      WHERE r."tokenHash" = ${tokenHash} AND r."userId" = u.id
    ) AS revoked
    FROM "users" u WHERE u.id = ${payload.id} LIMIT 1`;
  if (rows.length !== 1 || rows[0].sessionVersion !== tokenVersion || rows[0].revoked) {
    throw new InvalidSessionError();
  }
  return { userId: payload.id, tokenHash, expiresAt };
}

export function requireScope(allowedScope: string | null = null) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      
      const payload = request.user as SessionClaims;
      let requiresSessionValidation = false;
      
      // If we require a specific scope, ensure it matches
      if (allowedScope) {
        if (payload.scope !== allowedScope) {
          return reply.status(403).send({ error: 'Forbidden', message: 'Escopo de token inválido para esta ação.' });
        }
        requiresSessionValidation = allowedScope === 'session';
      } else {
        // If we require NO scope (regular session token)
        if (payload.scope && payload.scope !== 'session') {
          return reply.status(403).send({ error: 'Forbidden', message: 'Token temporário não pode ser usado aqui.' });
        }
        requiresSessionValidation = true;
      }

      if (requiresSessionValidation) await validateActiveSession(request, payload);
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Não autorizado' });
    }
  };
}
