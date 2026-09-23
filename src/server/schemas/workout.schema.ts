import { z } from 'zod';
import { getLocalDateRangeBounds } from '../utils/timezone.js';

const progressCursorSchema = z.object({
  startedAt: z.iso.datetime(), sessionId: z.string().uuid(),
  startDate: z.string(), endDate: z.string(), timeZone: z.string(), exerciseId: z.string().uuid(),
}).strict();

export const workoutProgressQuerySchema = z.object({
  startDate: z.string().length(10), endDate: z.string().length(10),
  timeZone: z.string().min(1).max(100), exerciseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().transform((query, ctx) => {
  let bounds: ReturnType<typeof getLocalDateRangeBounds>;
  try {
    bounds = getLocalDateRangeBounds(query.startDate, query.endDate, query.timeZone);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    ctx.addIssue({ code: 'custom', message: error.message });
    return z.NEVER;
  }
  let cursor: z.infer<typeof progressCursorSchema> | undefined;
  if (query.cursor) {
    try {
      cursor = progressCursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (cursor.startDate !== query.startDate || cursor.endDate !== query.endDate
        || cursor.timeZone !== query.timeZone || cursor.exerciseId !== query.exerciseId
        || new Date(cursor.startedAt) < bounds.startInclusiveUTC || new Date(cursor.startedAt) >= bounds.endExclusiveUTC) {
        throw new Error('Cursor does not belong to this filter');
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Cursor de progresso inválido para os filtros informados.' });
      return z.NEVER;
    }
  }
  return { ...query, ...bounds, cursor };
});
export type WorkoutProgressQuery = z.infer<typeof workoutProgressQuerySchema>;

const routineName = z.string().trim().min(1, 'O nome da rotina é obrigatório').max(100, 'Nome muito longo');
const routineExercises = z.array(z.object({
    exerciseId: z.string().uuid('ID de exercício inválido'),
    order: z.number().int().nonnegative().max(2147483647),
    notes: z.string().trim().max(500, 'Anotação muito longa').nullable().optional(),
    restTime: z.number().int().nonnegative().max(2147483647).nullable().optional(),
  }).strict()).refine(items => new Set(items.map(item => item.order)).size === items.length, 'Ordem de exercícios repetida');
export const createRoutineSchema = z.object({ name: routineName, exercises: routineExercises }).strict();
export const updateRoutineSchema = z.object({ name: routineName.optional(), exercises: routineExercises.optional() }).strict()
  .refine(data => Object.keys(data).length > 0, 'Informe ao menos um campo.');
export const routineParamsSchema = z.object({ routineId: z.string().uuid('ID de rotina inválido') });
export const routineQuerySchema = z.object({ summary: z.enum(['true', 'false']).optional() });

export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;

export const startSessionSchema = z.object({
  routineId: z.string().uuid('ID de rotina inválido').optional(),
  name: z.string().trim().min(1, 'O nome é obrigatório').max(100, 'Nome muito longo').optional(),
}).strict();

export const sessionParamsSchema = z.object({ sessionId: z.string().uuid('ID de sessão inválido') });

const historyCursorSchema = z.object({
  endedAt: z.iso.datetime(),
  id: z.string().uuid(),
}).strict();

export const workoutHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx) => {
    try {
      const decoded = historyCursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
      if (decoded.success) return decoded.data;
    } catch { /* Malformed cursors are input errors, never database errors. */ }
    ctx.addIssue({ code: 'custom', message: 'Cursor de histórico inválido' });
    return z.NEVER;
  }).optional(),
}).strict();

export type WorkoutHistoryQuery = z.infer<typeof workoutHistoryQuerySchema>;
export const endSessionSchema = z.object({}).strict();
export const workoutExerciseParamsSchema = sessionParamsSchema.extend({
  workoutExerciseId: z.string().uuid('ID de exercício da sessão inválido'),
});
export const addSessionExerciseSchema = z.object({
  exerciseId: z.string().uuid('ID de exercício inválido'),
}).strict();
export const workoutExerciseNotesSchema = z.object({
  notes: z.string().trim().max(500, 'Anotação muito longa').nullable().transform(value => value || null),
}).strict();

export type StartSessionInput = z.infer<typeof startSessionSchema>;

export const workoutSetParamsSchema = workoutExerciseParamsSchema.extend({
  workoutSetId: z.string().uuid('ID de série inválido'),
});
export const dropSetSegmentParamsSchema = workoutSetParamsSchema.extend({
  segmentId: z.string().uuid('ID de segmento inválido'),
});
const metricWeight = z.number().finite().nonnegative();
const metricInteger = z.number().int().nonnegative().max(2147483647);
const setFields = {
  type: z.enum(['WORKING', 'WARMUP', 'DROP_SET']).optional(),
  weight: metricWeight.nullable().optional(),
  reps: metricInteger.nullable().optional(),
  restTime: metricInteger.optional(),
};
export const createWorkoutSetSchema = z.object(setFields).strict();
export const updateWorkoutSetSchema = z.object(setFields).strict()
  .refine(data => Object.keys(data).length > 0, 'Informe ao menos um campo.');
export const workoutSetCompletionSchema = z.object({ completed: z.boolean() }).strict();
export const createDropSetSegmentSchema = z.object({ weight: metricWeight, reps: metricInteger }).strict();
export const updateDropSetSegmentSchema = createDropSetSegmentSchema.partial()
  .refine(data => Object.keys(data).length > 0, 'Informe ao menos um campo.');
export type WorkoutExerciseParams = z.infer<typeof workoutExerciseParamsSchema>;
export type WorkoutSetParams = z.infer<typeof workoutSetParamsSchema>;
export type DropSetSegmentParams = z.infer<typeof dropSetSegmentParamsSchema>;
export type WorkoutSetInput = z.infer<typeof createWorkoutSetSchema>;
export type DropSetSegmentInput = z.infer<typeof createDropSetSegmentSchema>;
