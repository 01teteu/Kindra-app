import * as weekly from '../controllers/weekly-training.controller.js';
import * as workoutController from '../controllers/workout.controller.js';
import { FastifyInstance } from 'fastify';
import { getExercisesController, getRoutinesController, createRoutineController } from '../controllers/workout.controller.js';
import { requireScope } from '../middlewares/auth.js';
import { startSessionController, getActiveSessionController, addSessionExerciseController, removeSessionExerciseController, updateSessionExerciseNotesController } from '../controllers/workout.controller.js';

export async function workoutRoutes(fastify: FastifyInstance) {
  // Todas as rotas de treino exigem usuário autenticado com escopo de sessão plena
  fastify.addHook('onRequest', requireScope('session'));
  
  fastify.post('/plans', weekly.createPlan);
  fastify.get('/plans', weekly.listPlans);
  fastify.get('/plans/active', weekly.getActivePlan);
  fastify.get('/plans/:planId', weekly.getPlan);
  fastify.patch('/plans/:planId', weekly.renamePlan);
  fastify.post('/plans/:planId/activate', weekly.activatePlan);
  fastify.put('/plans/:planId/days/:dayOfWeek', weekly.setDay);
  fastify.delete('/plans/:planId/days/:dayOfWeek', weekly.removeDay);

  fastify.get('/exercises', getExercisesController);
  fastify.get('/routines', getRoutinesController);
  fastify.post('/routines', createRoutineController);
  fastify.get('/routines/:routineId', workoutController.getRoutineController);
  fastify.patch('/routines/:routineId', workoutController.updateRoutineController);
  fastify.delete('/routines/:routineId', workoutController.deleteRoutineController);
  fastify.post('/sessions', startSessionController);
  fastify.get('/sessions/active', getActiveSessionController);
  fastify.get('/sessions/:sessionId/previous-performance', workoutController.getPreviousPerformanceController);
  fastify.get('/sessions/:sessionId/personal-records', workoutController.getPersonalRecordsController);
  fastify.get('/history', workoutController.getHistoryController);
  fastify.get('/sessions/:sessionId', workoutController.getSessionController);
  fastify.post('/sessions/:sessionId/finish', workoutController.finishSessionController);
  fastify.post('/sessions/:sessionId/discard', workoutController.discardSessionController);
  fastify.post('/sessions/:sessionId/exercises', addSessionExerciseController);
  fastify.delete('/sessions/:sessionId/exercises/:workoutExerciseId', removeSessionExerciseController);
  fastify.patch('/sessions/:sessionId/exercises/:workoutExerciseId', updateSessionExerciseNotesController);
  fastify.post('/sessions/:sessionId/exercises/:workoutExerciseId/sets', workoutController.createWorkoutSetController);
  fastify.patch('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId', workoutController.updateWorkoutSetController);
  fastify.delete('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId', workoutController.removeWorkoutSetController);
  fastify.patch('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId/completion', workoutController.setWorkoutSetCompletionController);
  fastify.post('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId/segments', workoutController.createDropSetSegmentController);
  fastify.patch('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId/segments/:segmentId', workoutController.updateDropSetSegmentController);
  fastify.delete('/sessions/:sessionId/exercises/:workoutExerciseId/sets/:workoutSetId/segments/:segmentId', workoutController.removeDropSetSegmentController);
}
