import { FastifyInstance } from 'fastify';
import { getOptionsController, createProfileController } from '../controllers/profile.controller.js';
import { requireScope } from '../middlewares/auth.js';

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireScope());

  fastify.get('/options', getOptionsController);
  fastify.post('/', createProfileController);
}
