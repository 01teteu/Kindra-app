import { FastifyRequest, FastifyReply } from 'fastify';
import * as workoutService from '../services/workout.service.js';
import { createRoutineSchema, updateRoutineSchema, routineParamsSchema, routineQuerySchema } from '../schemas/workout.schema.js';
import { z } from 'zod';
import { startSessionSchema, sessionParamsSchema, workoutExerciseParamsSchema, addSessionExerciseSchema, workoutExerciseNotesSchema } from '../schemas/workout.schema.js';

function sessionError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) return reply.status(400).send({ error: error.issues[0].message, details: error.format() });
  if (error instanceof workoutService.WorkoutSessionError) return reply.status(error.statusCode).send({ error: error.message });
  console.error('[WorkoutController - session]', error);
  return reply.status(500).send({ error: 'Erro ao executar operação na sessão' });
}

export async function startSessionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const data = startSessionSchema.parse(req.body ?? {});
    return reply.status(201).send(await workoutService.startSession((req.user as { id: string }).id, data));
  } catch (error) { return sessionError(reply, error); }
}

export async function getActiveSessionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send(await workoutService.getActiveSession((req.user as { id: string }).id));
  } catch (error) { return sessionError(reply, error); }
}

export async function getSessionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    return reply.send(await workoutService.getSession((req.user as { id: string }).id, sessionId));
  } catch (error) { return sessionError(reply, error); }
}

export async function getPreviousPerformanceController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    return reply.send(await workoutService.getPreviousPerformance((req.user as { id: string }).id, sessionId));
  } catch (error) { return sessionError(reply, error); }
}

export async function getPersonalRecordsController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    return reply.send(await workoutService.getPersonalRecords((req.user as { id: string }).id, sessionId));
  } catch (error) { return sessionError(reply, error); }
}

export async function getHistoryController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const query = workoutSchema.workoutHistoryQuerySchema.parse(req.query);
    return reply.send(await workoutService.getHistory((req.user as { id: string }).id, query));
  } catch (error) { return sessionError(reply, error); }
}

export async function addSessionExerciseController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    const { exerciseId } = addSessionExerciseSchema.parse(req.body);
    return reply.status(201).send(await workoutService.addSessionExercise((req.user as { id: string }).id, sessionId, exerciseId));
  } catch (error) { return sessionError(reply, error); }
}

export async function removeSessionExerciseController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId, workoutExerciseId } = workoutExerciseParamsSchema.parse(req.params);
    return reply.send(await workoutService.removeSessionExercise((req.user as { id: string }).id, sessionId, workoutExerciseId));
  } catch (error) { return sessionError(reply, error); }
}

export async function updateSessionExerciseNotesController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId, workoutExerciseId } = workoutExerciseParamsSchema.parse(req.params);
    const { notes } = workoutExerciseNotesSchema.parse(req.body);
    return reply.send(await workoutService.updateSessionExerciseNotes((req.user as { id: string }).id, sessionId, workoutExerciseId, notes));
  } catch (error) { return sessionError(reply, error); }
}

export async function getExercisesController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const exercises = await workoutService.getCatalog((req.user as { id: string }).id);
    return reply.send(exercises);
  } catch (err: any) {
    console.error('[WorkoutController - getExercises]', err);
    return reply.status(500).send({ error: 'Erro ao buscar catálogo de exercícios' });
  }
}

export async function getRoutinesController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as { id: string };
    const query = routineQuerySchema.parse(req.query);
    const routines = await workoutService.getUserRoutines(userId, query.summary === 'true');
    return reply.send(routines);
  } catch (err: any) {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: err.issues[0].message });
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
    if (err instanceof workoutService.WorkoutSessionError) return reply.status(err.statusCode).send({ error: err.message });
    console.error('[WorkoutController - createRoutine]', err);
    return reply.status(500).send({ error: 'Erro ao criar rotina' });
  }
}

export async function getRoutineController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { routineId } = routineParamsSchema.parse(req.params);
    return reply.send(await workoutService.getRoutine((req.user as { id: string }).id, routineId));
  } catch (error) { return sessionError(reply, error); }
}
export async function updateRoutineController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { routineId } = routineParamsSchema.parse(req.params);
    return reply.send(await workoutService.updateRoutine((req.user as { id: string }).id, routineId, updateRoutineSchema.parse(req.body)));
  } catch (error) { return sessionError(reply, error); }
}
export async function deleteRoutineController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { routineId } = routineParamsSchema.parse(req.params);
    await workoutService.deleteRoutine((req.user as { id: string }).id, routineId);
    return reply.status(204).send();
  } catch (error) { return sessionError(reply, error); }
}

import * as workoutSchema from '../schemas/workout.schema.js';

export async function finishSessionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    workoutSchema.endSessionSchema.parse(req.body ?? {});
    return reply.send(await workoutService.endSession((req.user as { id: string }).id, sessionId, 'COMPLETED'));
  } catch (error) { return sessionError(reply, error); }
}

export async function discardSessionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);
    workoutSchema.endSessionSchema.parse(req.body ?? {});
    return reply.send(await workoutService.endSession((req.user as { id: string }).id, sessionId, 'DISCARDED'));
  } catch (error) { return sessionError(reply, error); }
}

export async function createWorkoutSetController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.workoutExerciseParamsSchema.parse(req.params);
    const data = workoutSchema.createWorkoutSetSchema.parse(req.body ?? {});
    return reply.status(201).send(await workoutService.createWorkoutSet((req.user as { id: string }).id, params, data));
  } catch (error) { return sessionError(reply, error); }
}

export async function updateWorkoutSetController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.workoutSetParamsSchema.parse(req.params);
    const data = workoutSchema.updateWorkoutSetSchema.parse(req.body);
    return reply.status(200).send(await workoutService.updateWorkoutSet((req.user as { id: string }).id, params, data));
  } catch (error) { return sessionError(reply, error); }
}

export async function removeWorkoutSetController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.workoutSetParamsSchema.parse(req.params);
    return reply.status(200).send(await workoutService.removeWorkoutSet((req.user as { id: string }).id, params));
  } catch (error) { return sessionError(reply, error); }
}

export async function setWorkoutSetCompletionController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.workoutSetParamsSchema.parse(req.params);
    const data = workoutSchema.workoutSetCompletionSchema.parse(req.body);
    return reply.status(200).send(await workoutService.setWorkoutSetCompletion((req.user as { id: string }).id, params, data.completed));
  } catch (error) { return sessionError(reply, error); }
}

export async function createDropSetSegmentController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.workoutSetParamsSchema.parse(req.params);
    const data = workoutSchema.createDropSetSegmentSchema.parse(req.body);
    return reply.status(201).send(await workoutService.createDropSetSegment((req.user as { id: string }).id, params, data));
  } catch (error) { return sessionError(reply, error); }
}

export async function updateDropSetSegmentController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.dropSetSegmentParamsSchema.parse(req.params);
    const data = workoutSchema.updateDropSetSegmentSchema.parse(req.body);
    return reply.status(200).send(await workoutService.updateDropSetSegment((req.user as { id: string }).id, params, data));
  } catch (error) { return sessionError(reply, error); }
}

export async function removeDropSetSegmentController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = workoutSchema.dropSetSegmentParamsSchema.parse(req.params);
    return reply.status(200).send(await workoutService.removeDropSetSegment((req.user as { id: string }).id, params));
  } catch (error) { return sessionError(reply, error); }
}
