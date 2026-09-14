import prisma from '../db.js';
import { CreateRoutineInput, StartSessionInput, WorkoutExerciseParams, WorkoutSetParams, DropSetSegmentParams, WorkoutSetInput, DropSetSegmentInput } from '../schemas/workout.schema.js';
import { Prisma } from '@prisma/client';
import type { WorkoutHistoryQuery, UpdateRoutineInput } from '../schemas/workout.schema.js';
import { eligibleEstimate, reconstructPersonalRecords, type PersonalRecord } from '../domain/personal-records.js';

export class ExerciseAccessError extends Error {
  constructor() { super('Um ou mais exercícios estão indisponíveis.'); }
}

export class WorkoutSessionError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

const sessionSelect = {
  id: true, routineId: true, name: true, status: true, startedAt: true, endedAt: true,
  exercises: {
    orderBy: { order: 'asc' },
    select: {
      id: true, exerciseId: true, order: true, notes: true, restTimeSnapshot: true,
      exerciseNameSnapshot: true, primaryMuscleSnapshot: true,
      equipmentSnapshot: true, measurementTypeSnapshot: true,
      sets: { orderBy: { setNumber: 'asc' }, select: {
        id: true, workoutExerciseId: true, setNumber: true, type: true,
        weight: true, reps: true, restTime: true, completedAt: true,
        segments: { orderBy: { order: 'asc' }, select: {
          id: true, workoutSetId: true, order: true, weight: true, reps: true, completedAt: true,
        } },
      } },
    },
  },
} satisfies Prisma.WorkoutSessionSelect;

const availableExercise = (userId: string): Prisma.ExerciseWhereInput => ({
  isActive: true, OR: [{ origin: 'GLOBAL', userId: null }, { origin: 'CUSTOM', userId }],
});

// Retry serialization conflicts, keeping routine copying and concurrent mutations atomic.
async function sessionTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>, conflictMessage = 'Sessão alterada simultaneamente. Tente novamente.'): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !(error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) throw error;
      if (attempt >= 2) throw new WorkoutSessionError(409, conflictMessage);
    }
  }
}

async function lockActiveSession(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
  const sessions = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM workout_sessions WHERE id = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
  if (!sessions.length) throw new WorkoutSessionError(404, 'Sessão não encontrada.');
  if (sessions[0].status !== 'ACTIVE') throw new WorkoutSessionError(409, 'A sessão não está ACTIVE.');
}

async function requireAvailableExercise(tx: Prisma.TransactionClient, userId: string, exerciseId: string) {
  await tx.$queryRaw`SELECT id FROM exercises WHERE id = ${exerciseId}
    AND "isActive" = true AND (origin = 'GLOBAL' OR (origin = 'CUSTOM' AND "userId" = ${userId})) FOR SHARE`;
  const exercise = await tx.exercise.findFirst({ where: { id: exerciseId, ...availableExercise(userId) }, select: { id: true } });
  if (!exercise) throw new WorkoutSessionError(404, 'Exercício não encontrado ou indisponível.');
}

function sessionResponse(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
  return tx.workoutSession.findFirstOrThrow({ where: { id: sessionId, userId }, select: sessionSelect });
}

export async function startSession(userId: string, data: StartSessionInput) {
  try {
    return await sessionTransaction(async tx => {
      if (await tx.workoutSession.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } })) {
        throw new WorkoutSessionError(409, 'Já existe uma sessão ACTIVE. Recupere-a em /api/workouts/sessions/active.');
      }
      const routine = data.routineId ? await tx.routine.findFirst({
        where: { id: data.routineId, userId },
        select: { id: true, name: true, exercises: { orderBy: { order: 'asc' }, select: { exerciseId: true, order: true, notes: true, restTime: true } } },
      }) : null;
      if (data.routineId && !routine) throw new WorkoutSessionError(404, 'Rotina não encontrada.');
      const exercises = routine?.exercises ?? [];
      if (exercises.some(ex => ex.order < 0) || new Set(exercises.map(ex => ex.order)).size !== exercises.length) {
        throw new WorkoutSessionError(400, 'A rotina possui ordens de exercícios inválidas ou repetidas.');
      }
      for (const id of [...new Set(exercises.map(ex => ex.exerciseId))].sort()) {
        await requireAvailableExercise(tx, userId, id);
      }
      return tx.workoutSession.create({
        data: {
          userId, routineId: routine?.id, name: data.name ?? routine?.name ?? 'Treino livre',
          status: 'ACTIVE', startedAt: new Date(),
          exercises: { create: exercises.map(ex => ({ exerciseId: ex.exerciseId, order: ex.order, notes: ex.notes, restTimeSnapshot: ex.restTime })) },
        },
        select: sessionSelect,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
        await prisma.workoutSession.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } })) {
      throw new WorkoutSessionError(409, 'Já existe uma sessão ACTIVE. Recupere-a em /api/workouts/sessions/active.');
    }
    throw error;
  }
}

export function getActiveSession(userId: string) {
  return prisma.workoutSession.findFirst({ where: { userId, status: 'ACTIVE' }, select: sessionSelect });
}

export async function getSession(userId: string, sessionId: string) {
  const session = await prisma.workoutSession.findFirst({ where: { id: sessionId, userId }, select: sessionSelect });
  if (!session) throw new WorkoutSessionError(404, 'Sessão não encontrada.');
  return session;
}

async function personalRecords(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
  const target = await tx.workoutSession.findFirst({ where: { id: sessionId, userId }, select: sessionSelect });
  if (!target) throw new WorkoutSessionError(404, 'Sessão não encontrada.');
  const historical = await tx.workoutSet.findMany({
    where: {
      type: 'WORKING', completedAt: { not: null }, weight: { gt: 0 }, reps: { gte: 1, lte: 12 },
      workoutExercise: {
        exerciseId: { in: [...new Set(target.exercises.map(ex => ex.exerciseId))] },
        measurementTypeSnapshot: 'WEIGHT_REPS',
        sessionIdRel: { userId, status: 'COMPLETED', endedAt: { lt: target.startedAt }, id: { not: sessionId } },
      },
    },
    select: { type: true, weight: true, reps: true, completedAt: true, workoutExercise: { select: { exerciseId: true } } },
  });
  const baseline = new Map<string, number>();
  for (const set of historical) {
    const value = eligibleEstimate(set, 'WEIGHT_REPS');
    if (value !== null) baseline.set(set.workoutExercise.exerciseId, Math.max(baseline.get(set.workoutExercise.exerciseId) ?? 0, value));
  }
  return { items: reconstructPersonalRecords(target.exercises, baseline) };
}

export function getPersonalRecords(userId: string, sessionId: string) {
  // A consistent snapshot also protects reconstruction from concurrent edits.
  return sessionTransaction(tx => personalRecords(tx, userId, sessionId));
}

export async function getPreviousPerformance(userId: string, sessionId: string) {
  const target = await prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    select: { startedAt: true, exercises: { orderBy: { order: 'asc' }, select: { id: true, exerciseId: true } } },
  });
  if (!target) throw new WorkoutSessionError(404, 'Sessão não encontrada.');
  if (!target.exercises.length) return { items: [] };
  // Prisma's per-parent take can load all matching history. Select only winning IDs in PostgreSQL.
  const winners = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (we."exerciseId") we.id
    FROM workout_exercises we JOIN workout_sessions ws ON ws.id = we."sessionId"
    WHERE we."exerciseId" IN (${Prisma.join([...new Set(target.exercises.map(item => item.exerciseId))])})
      AND ws."userId" = ${userId} AND ws.status = 'COMPLETED'
      AND ws."endedAt" < ${target.startedAt} AND ws.id <> ${sessionId}
    ORDER BY we."exerciseId", ws."endedAt" DESC, ws.id DESC, we."order" ASC`;
  const executions = await prisma.workoutExercise.findMany({
    where: { id: { in: winners.map(item => item.id) }, sessionIdRel: { userId } },
    select: {
      id: true, exerciseId: true, sessionId: true, notes: true, measurementTypeSnapshot: true,
      sessionIdRel: { select: { endedAt: true } },
      sets: { where: { completedAt: { not: null } }, orderBy: { setNumber: 'asc' }, select: {
        type: true, weight: true, reps: true, completedAt: true,
        segments: { orderBy: { order: 'asc' }, select: { weight: true, reps: true, completedAt: true } },
      } },
    },
  });
  const previousByExercise = new Map(executions.map(execution => {
    const ordinal = { WORKING: 0, WARMUP: 0, DROP_SET: 0 };
    const sets = execution.sets.filter(set => set.type !== 'DROP_SET' ||
      (set.segments.length >= 2 && set.segments.every(segment => segment.completedAt !== null)))
      .map(set => ({ ...set, ordinal: ++ordinal[set.type] }));
    return [execution.exerciseId, {
      sessionId: execution.sessionId, workoutExerciseId: execution.id, endedAt: execution.sessionIdRel.endedAt,
      notes: execution.notes, measurementTypeSnapshot: execution.measurementTypeSnapshot, sets,
    }] as const;
  }));
  return { items: target.exercises.map(item => ({
    workoutExerciseId: item.id, exerciseId: item.exerciseId, previous: previousByExercise.get(item.exerciseId) ?? null,
  })) };
}

export async function getHistory(userId: string, { limit, cursor }: WorkoutHistoryQuery) {
  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId, status: 'COMPLETED',
      ...(cursor ? { OR: [
        { endedAt: { lt: new Date(cursor.endedAt) } },
        { endedAt: new Date(cursor.endedAt), id: { lt: cursor.id } },
      ] } : {}),
    },
    orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true, name: true, startedAt: true, endedAt: true, status: true,
      _count: { select: { exercises: true } },
    },
  });
  const items = sessions.slice(0, limit).map(({ _count, ...session }) => ({
    ...session, exerciseCount: _count.exercises,
  }));
  const last = items.at(-1);
  const nextCursor = sessions.length > limit && last
    ? Buffer.from(JSON.stringify({ endedAt: last.endedAt, id: last.id })).toString('base64url')
    : null;
  return { items, nextCursor };
}

export function endSession(userId: string, sessionId: string, status: 'COMPLETED' | 'DISCARDED') {
  return sessionTransaction(async tx => {
    await lockActiveSession(tx, userId, sessionId);
    await tx.workoutSession.update({
      where: { id: sessionId, userId }, data: { status, endedAt: new Date() },
    });
    return sessionResponse(tx, userId, sessionId);
  });
}

export function addSessionExercise(userId: string, sessionId: string, exerciseId: string) {
  return sessionTransaction(async tx => {
    await lockActiveSession(tx, userId, sessionId);
    await requireAvailableExercise(tx, userId, exerciseId);
    const last = await tx.workoutExercise.aggregate({
      where: { sessionId, sessionIdRel: { userId } }, _max: { order: true },
    });
    await tx.workoutExercise.create({ data: { sessionId, exerciseId, order: (last._max.order ?? -1) + 1 } });
    return sessionResponse(tx, userId, sessionId);
  });
}

export function removeSessionExercise(userId: string, sessionId: string, workoutExerciseId: string) {
  return sessionTransaction(async tx => {
    await lockActiveSession(tx, userId, sessionId);
    const result = await tx.workoutExercise.deleteMany({ where: { id: workoutExerciseId, sessionId, sessionIdRel: { userId } } });
    if (!result.count) throw new WorkoutSessionError(404, 'Exercício da sessão não encontrado.');
    return sessionResponse(tx, userId, sessionId);
  });
}

export function updateSessionExerciseNotes(userId: string, sessionId: string, workoutExerciseId: string, notes: string | null) {
  return sessionTransaction(async tx => {
    await lockActiveSession(tx, userId, sessionId);
    const result = await tx.workoutExercise.updateMany({
      where: { id: workoutExerciseId, sessionId, sessionIdRel: { userId } }, data: { notes },
    });
    if (!result.count) throw new WorkoutSessionError(404, 'Exercício da sessão não encontrado.');
    return sessionResponse(tx, userId, sessionId);
  });
}

export async function getCatalog(userId: string) {
  return prisma.exercise.findMany({
    where: { isActive: true, OR: [{ origin: 'GLOBAL', userId: null }, { origin: 'CUSTOM', userId }] },
    orderBy: { name: 'asc' }
  });
}

export async function getUserRoutines(userId: string, summary = false) {
  if (summary) {
    const rows = await prisma.routine.findMany({ where: { userId }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, _count: { select: { exercises: true } } } });
    return rows.map(row => ({ id: row.id, name: row.name, exerciseCount: row._count.exercises }));
  }
  return prisma.routine.findMany({
    where: { userId },
    include: {
      exercises: {
        include: { exercise: true },
        orderBy: { order: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

const routineDetailSelect = {
  id: true, name: true, createdAt: true, updatedAt: true,
  exercises: { orderBy: { order: 'asc' }, select: {
    id: true, exerciseId: true, order: true, notes: true, restTime: true,
    exercise: { select: { id: true, name: true, primaryMuscle: true, equipment: true,
      measurementType: true, origin: true, isActive: true, thumbnailUrl: true } },
  } },
} satisfies Prisma.RoutineSelect;

export async function getRoutine(userId: string, routineId: string) {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, userId }, select: routineDetailSelect });
  if (!routine) throw new WorkoutSessionError(404, 'Rotina não encontrada.');
  return routine;
}

async function validateRoutineExercises(tx: Prisma.TransactionClient, userId: string, exercises: CreateRoutineInput['exercises']) {
  // Same catalog access and row-lock pattern as start; duplicates remain allowed.
  for (const id of [...new Set(exercises.map(ex => ex.exerciseId))].sort()) {
    await requireAvailableExercise(tx, userId, id);
  }
}
const plannedExercises = (exercises: CreateRoutineInput['exercises']) => exercises.map(ex => ({
  exerciseId: ex.exerciseId, order: ex.order, notes: ex.notes || null, restTime: ex.restTime ?? null,
}));
const routineConflict = 'Rotina alterada simultaneamente. Tente novamente.';

export async function createRoutine(userId: string, data: CreateRoutineInput) {
  return sessionTransaction(async tx => {
    await validateRoutineExercises(tx, userId, data.exercises);
    return tx.routine.create({ data: { name: data.name, userId, exercises: { create: plannedExercises(data.exercises) } }, select: routineDetailSelect });
  }, routineConflict);
}

async function lockOwnedRoutine(tx: Prisma.TransactionClient, userId: string, routineId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM routines WHERE id = ${routineId} AND "userId" = ${userId} FOR UPDATE`;
  if (!rows.length) throw new WorkoutSessionError(404, 'Rotina não encontrada.');
}

export async function updateRoutine(userId: string, routineId: string, data: UpdateRoutineInput) {
  return sessionTransaction(async tx => {
    await lockOwnedRoutine(tx, userId, routineId);
    if (data.exercises !== undefined) {
      await validateRoutineExercises(tx, userId, data.exercises);
      await tx.routineExercise.deleteMany({ where: { routineId } });
    }
    // A replacement list and name become visible together; no historical rows reference these item IDs.
    return tx.routine.update({ where: { id: routineId }, data: {
      name: data.name, updatedAt: new Date(),
      ...(data.exercises !== undefined ? { exercises: { create: plannedExercises(data.exercises) } } : {}),
    }, select: routineDetailSelect });
  }, routineConflict);
}

export async function deleteRoutine(userId: string, routineId: string) {
  return sessionTransaction(async tx => {
    await lockOwnedRoutine(tx, userId, routineId);
    // Existing FKs cascade weekly days and SET NULL on sessions; snapshots stay intact.
    await tx.routine.delete({ where: { id: routineId } });
  }, routineConflict);
}

// All execution mutations share the session lock, including Task 1A operations.
async function setMutation(userId: string, params: WorkoutExerciseParams, action: (tx: Prisma.TransactionClient) => Promise<void | { achievement: PersonalRecord | null }>) {
  try {
    return await sessionTransaction(async tx => {
      await lockActiveSession(tx, userId, params.sessionId);
      const exercise = await tx.workoutExercise.findFirst({ where: {
        id: params.workoutExerciseId, sessionId: params.sessionId, sessionIdRel: { userId },
      }, select: { measurementTypeSnapshot: true } });
      if (!exercise) throw new WorkoutSessionError(404, 'Exercício da sessão não encontrado.');
      if (exercise.measurementTypeSnapshot !== 'WEIGHT_REPS') {
        throw new WorkoutSessionError(400, 'measurementType não suportado: execução disponível apenas para WEIGHT_REPS.');
      }
      const extra = await action(tx);
      return { ...await sessionResponse(tx, userId, params.sessionId), ...(extra || {}) };
    });
  } catch (error) {
    // Prisma 5 exposes PostgreSQL trigger/check failures as unknown connector errors.
    if (error instanceof Prisma.PrismaClientUnknownRequestError &&
        /code: "(?:23514|23505|40001|40P01)"/.test(error.message)) {
      throw new WorkoutSessionError(409, 'Conflito ao alterar série ou segmentos. Atualize a sessão e tente novamente.');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new WorkoutSessionError(404, 'Recurso não encontrado.');
      if (['P2002', 'P2003', 'P2004', 'P2034'].includes(error.code) ||
          (error.code === 'P2010' && ['23514', '23505', '40001', '40P01'].includes(String(error.meta?.code)))) {
        throw new WorkoutSessionError(409, 'Conflito ao alterar série ou segmentos. Atualize a sessão e tente novamente.');
      }
    }
    throw error;
  }
}

async function requireWorkoutSet(tx: Prisma.TransactionClient, params: WorkoutSetParams) {
  const set = await tx.workoutSet.findFirst({ where: { id: params.workoutSetId, workoutExerciseId: params.workoutExerciseId } });
  if (!set) throw new WorkoutSessionError(404, 'Série não encontrada.');
  return set;
}

function validateSimpleMetrics(weight: number | null, reps: number | null) {
  if (weight === null || !Number.isFinite(weight) || weight < 0 || reps === null || !Number.isInteger(reps) || reps < 0 || reps > 2147483647) {
    throw new WorkoutSessionError(400, 'Informe weight e reps válidos para concluir a série.');
  }
}

function rejectDropMetrics(type: string, data: WorkoutSetInput) {
  if (type === 'DROP_SET' && (data.weight !== undefined || data.reps !== undefined)) {
    throw new WorkoutSessionError(400, 'DROP_SET aceita weight e reps exclusivamente nos segmentos.');
  }
}

function nextPosition(last: number | null, initial: number) {
  const next = last === null ? initial : last + 1;
  if (next > 2147483647) throw new WorkoutSessionError(409, 'Limite de ordenação atingido.');
  return next;
}

export function createWorkoutSet(userId: string, params: WorkoutExerciseParams, data: WorkoutSetInput) {
  return setMutation(userId, params, async tx => {
    const type = data.type ?? 'WORKING';
    rejectDropMetrics(type, data);
    const last = await tx.workoutSet.aggregate({ where: { workoutExerciseId: params.workoutExerciseId }, _max: { setNumber: true } });
    await tx.workoutSet.create({ data: {
      workoutExerciseId: params.workoutExerciseId, setNumber: nextPosition(last._max.setNumber, 1),
      type, weight: data.weight, reps: data.reps, restTime: data.restTime,
    } });
  });
}

export function updateWorkoutSet(userId: string, params: WorkoutSetParams, data: WorkoutSetInput) {
  return setMutation(userId, params, async tx => {
    const set = await requireWorkoutSet(tx, params);
    const type = data.type ?? set.type;
    if (type !== set.type && (type === 'DROP_SET' || set.type === 'DROP_SET')) {
      throw new WorkoutSessionError(409, 'Conversão entre DROP_SET e série simples não suportada.');
    }
    rejectDropMetrics(type, data);
    if (set.completedAt && type !== 'DROP_SET') {
      validateSimpleMetrics(data.weight === undefined ? set.weight : data.weight, data.reps === undefined ? set.reps : data.reps);
    }
    await tx.workoutSet.update({ where: { id: set.id }, data: { type, weight: data.weight, reps: data.reps, restTime: data.restTime } });
  });
}

export function removeWorkoutSet(userId: string, params: WorkoutSetParams) {
  return setMutation(userId, params, async tx => {
    const set = await requireWorkoutSet(tx, params);
    await tx.workoutSet.delete({ where: { id: set.id } });
  });
}

export function setWorkoutSetCompletion(userId: string, params: WorkoutSetParams, completed: boolean) {
  return setMutation(userId, params, async tx => {
    const set = await requireWorkoutSet(tx, params);
    if (completed && set.type !== 'DROP_SET') validateSimpleMetrics(set.weight, set.reps);
    if (set.type === 'DROP_SET' && completed) {
      const segments = await tx.dropSetSegment.findMany({ where: { workoutSetId: set.id } });
      if (segments.length < 2) throw new WorkoutSessionError(400, 'DROP_SET exige pelo menos dois segmentos para concluir.');
      for (const segment of segments) validateSimpleMetrics(segment.weight, segment.reps);
    }
    // Repeated completion preserves the original server timestamp.
    if (completed && set.completedAt) return { achievement: null };
    // Millisecond timestamps must preserve serialized completion order, even when
    // two requests finish in the same millisecond or the wall clock moves back.
    const latest = completed ? await tx.workoutSet.aggregate({
      where: { workoutExercise: { sessionId: params.sessionId } }, _max: { completedAt: true },
    }) : null;
    const completedAt = completed ? new Date(Math.max(Date.now(), (latest?._max.completedAt?.getTime() ?? 0) + 1)) : null;
    if (set.type === 'DROP_SET') {
      await tx.dropSetSegment.updateMany({ where: { workoutSetId: set.id }, data: { completedAt } });
    }
    await tx.workoutSet.update({ where: { id: set.id }, data: { completedAt } });
    const achievement = completed && set.type === 'WORKING'
      ? (await personalRecords(tx, userId, params.sessionId)).items.find(item => item.workoutSetId === set.id) ?? null
      : null;
    return { achievement };
  });
}

async function requireEditableDrop(tx: Prisma.TransactionClient, params: WorkoutSetParams, segmentId?: string) {
  const set = await requireWorkoutSet(tx, params);
  if (segmentId && !await tx.dropSetSegment.findFirst({ where: { id: segmentId, workoutSetId: set.id }, select: { id: true } })) {
    throw new WorkoutSessionError(404, 'Segmento não encontrado.');
  }
  if (set.type !== 'DROP_SET') throw new WorkoutSessionError(400, 'Segmentos exigem uma série DROP_SET.');
  if (set.completedAt) throw new WorkoutSessionError(409, 'Reabra o DROP_SET antes de alterar seus segmentos.');
  return set;
}

export function createDropSetSegment(userId: string, params: WorkoutSetParams, data: DropSetSegmentInput) {
  return setMutation(userId, params, async tx => {
    const set = await requireEditableDrop(tx, params);
    const last = await tx.dropSetSegment.aggregate({ where: { workoutSetId: set.id }, _max: { order: true } });
    await tx.dropSetSegment.create({ data: { workoutSetId: set.id, order: nextPosition(last._max.order, 0), weight: data.weight, reps: data.reps } });
  });
}

export function updateDropSetSegment(userId: string, params: DropSetSegmentParams, data: Partial<DropSetSegmentInput>) {
  return setMutation(userId, params, async tx => {
    await requireEditableDrop(tx, params, params.segmentId);
    await tx.dropSetSegment.update({ where: { id: params.segmentId }, data: { weight: data.weight, reps: data.reps } });
  });
}

export function removeDropSetSegment(userId: string, params: DropSetSegmentParams) {
  return setMutation(userId, params, async tx => {
    await requireEditableDrop(tx, params, params.segmentId);
    await tx.dropSetSegment.delete({ where: { id: params.segmentId } });
  });
}
