import { FastifyInstance } from 'fastify';
import { getExercisesController, getRoutinesController, createRoutineController } from '../controllers/workout.controller.js';
import { requireScope } from '../middlewares/auth.js';

export async function workoutRoutes(fastify: FastifyInstance) {
  // Todas as rotas de treino exigem usuário autenticado com escopo de sessão plena
  fastify.addHook('onRequest', requireScope('session'));
  
  fastify.get('/exercises', getExercisesController);
  fastify.get('/routines', getRoutinesController);
  fastify.post('/routines', createRoutineController);
}
