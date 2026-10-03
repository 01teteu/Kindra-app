import { FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema } from '../schemas/user.schema.js';
import * as userService from '../services/user.service.js';

export async function registerController(req: FastifyRequest, reply: FastifyReply) {
  // 1. Validação do body com Zod (safeParse)
  const parsed = registerSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues[0].message,
      details: parsed.error.format(),
    });
  }

  // 2. Envia dados validados para o Service
  try {
    await userService.createUser(parsed.data, (id, challengeId, email) => reply.jwtSign({
      id, scope: 'pending_verification', challengeId, email,
    }, { expiresIn: '20m' }));
    return reply.status(202).send({
      message: 'Se este endereço puder ser cadastrado, enviaremos instruções para continuar.',
    });
  } catch (error: any) {
    if (error.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(429).send({ error: 'Muitas tentativas. Por segurança, o cadastro foi bloqueado temporariamente.' });
    }
    if (error.message === 'COOLDOWN_ACTIVE') {
      return reply.status(429).send({ 
        error: `Aguarde ${error.retryAfter} segundos antes de tentar novamente.`,
        retryAfter: error.retryAfter
      });
    }
    
    // Fallback genérico para não expor stack trace
    console.error('[UserService Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}
