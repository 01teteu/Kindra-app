import { FastifyInstance } from 'fastify';
import { getOptionsController, createProfileController, getProfileController, updateProfileController } from '../controllers/profile.controller.js';
import { requireScope } from '../middlewares/auth.js';

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireScope());

  fastify.get('/options', getOptionsController);
  fastify.post('/', createProfileController);
  fastify.get('/', { onRequest: requireScope('session') }, getProfileController);
  fastify.put('/', {
    onRequest: requireScope('session'),
    bodyLimit: 16384,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: request => (request.user as { id: string }).id,
      },
    },
  }, updateProfileController);
}
