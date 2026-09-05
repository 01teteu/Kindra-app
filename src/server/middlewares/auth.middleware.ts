import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware para validar o token JWT nas rotas protegidas.
 */
export async function verifyAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    // req.jwtVerify() é injetado pelo @fastify/jwt
    // Ele extrai o Bearer token do header Authorization e valida a assinatura
    await req.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Não autorizado. Token ausente ou inválido.' });
  }
}
