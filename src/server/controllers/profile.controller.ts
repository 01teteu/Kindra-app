import { FastifyRequest, FastifyReply } from 'fastify';
import { profileSchema } from '../schemas/profile.schema.js';
import * as profileService from '../services/profile.service.js';

export async function getOptionsController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const options = await profileService.getCatalogOptions();
    return reply.send(options);
  } catch (error: any) {
    console.error('[ProfileOptions Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function createProfileController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = profileSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      details: parsed.error.format(),
    });
  }

  try {
    const userId = (req.user as any).id;
    
    if (!userId) {
      return reply.status(401).send({ error: 'Não autorizado' });
    }

    const profile = await profileService.createProfile(userId, parsed.data);
    
    return reply.status(201).send({
      message: 'Perfil criado com sucesso',
      profile,
    });
  } catch (error: any) {
    if (error.message === 'PROFILE_ALREADY_EXISTS') {
      return reply.status(409).send({ error: 'O perfil deste usuário já foi criado.' });
    }
    
    console.error('[CreateProfile Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}
