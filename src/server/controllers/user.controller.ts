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
    const user = await userService.createUser(parsed.data);
    
    // Gerar um token temporário com escopo para o fluxo de verificação
    const pendingToken = await reply.jwtSign({
      id: user.id,
      scope: 'pending_verification'
    }, { expiresIn: '1h' });
    
    // 3. Responde com sucesso
    return reply.status(201).send({
      message: 'Usuário criado com sucesso',
      user,
      pendingToken
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
