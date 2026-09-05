import { FastifyRequest, FastifyReply } from 'fastify';

export function requireScope(allowedScope: string | null = null) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      
      const payload = request.user as { id: string; scope?: string };
      
      // If we require a specific scope, ensure it matches
      if (allowedScope) {
        if (payload.scope !== allowedScope) {
          return reply.status(403).send({ error: 'Forbidden', message: 'Escopo de token inválido para esta ação.' });
        }
      } else {
        // If we require NO scope (regular session token)
        if (payload.scope && payload.scope !== 'session') {
          return reply.status(403).send({ error: 'Forbidden', message: 'Token temporário não pode ser usado aqui.' });
        }
      }
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Não autorizado' });
    }
  };
}
