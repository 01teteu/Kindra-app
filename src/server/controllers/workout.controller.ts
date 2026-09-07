import { FastifyRequest, FastifyReply } from 'fastify';
import * as workoutService from '../services/workout.service.js';
import { createRoutineSchema } from '../schemas/workout.schema.js';

export async function getExercisesController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const exercises = await workoutService.getCatalog();
    return reply.send(exercises);
  } catch (err: any) {
    console.error('[WorkoutController - getExercises]', err);
    return reply.status(500).send({ error: 'Erro ao buscar catálogo de exercícios' });
  }
}

export async function getRoutinesController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as { id: string };
    const routines = await workoutService.getUserRoutines(userId);
    return reply.send(routines);
  } catch (err: any) {
    console.error('[WorkoutController - getRoutines]', err);
    return reply.status(500).send({ error: 'Erro ao buscar rotinas' });
  }
}

export async function createRoutineController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as { id: string };
    
    const parsed = createRoutineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues[0].message,
        details: parsed.error.format(),
      });
    }

    const routine = await workoutService.createRoutine(userId, parsed.data);
    return reply.status(201).send(routine);
  } catch (err: any) {
    console.error('[WorkoutController - createRoutine]', err);
    return reply.status(500).send({ error: 'Erro ao criar rotina' });
  }
}
