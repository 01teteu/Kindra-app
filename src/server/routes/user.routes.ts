import { FastifyInstance } from 'fastify';
import { registerController } from '../controllers/user.controller.js';

export async function userRoutes(fastify: FastifyInstance) {
  // Rota de criação de conta com Rate Limit por IP mais restritivo (10 por hora)
  fastify.post('/register', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour'
      }
    }
  }, registerController);
}
