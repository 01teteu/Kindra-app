import { z } from 'zod';

export const NOTE_LIMIT = 500;
export type SetType = 'WARMUP' | 'WORKING' | 'DROP_SET';
export const catalogSchema = z.array(z.object({
  id: z.string(), name: z.string(), primaryMuscle: z.string(), equipment: z.string(),
  origin: z.enum(['GLOBAL', 'CUSTOM']), measurementType: z.enum(['WEIGHT_REPS', 'REPS_ONLY', 'TIME', 'DISTANCE_TIME']),
  thumbnailUrl: z.string().nullable().optional(), videoUrl: z.string().nullable().optional(),
}));
export type LiveCatalogExercise = z.infer<typeof catalogSchema.element>;
const metric = z.number().finite().nonnegative().nullable();
const timestamp = z.string().datetime().nullable();
const segmentSchema = z.object({
  id: z.string(), workoutSetId: z.string(), order: z.number().int().nonnegative(),
  weight: z.number().finite().nonnegative(), reps: z.number().int().nonnegative(), completedAt: timestamp,
});
const setBase = {
  id: z.string(), workoutExerciseId: z.string(), setNumber: z.number().int().positive(),
  restTime: z.number().int().nonnegative(), completedAt: timestamp,
};
const setSchema = z.discriminatedUnion('type', [
  z.object({ ...setBase, type: z.literal('WORKING'), weight: metric, reps: metric, segments: z.array(segmentSchema).max(0) }),
  z.object({ ...setBase, type: z.literal('WARMUP'), weight: metric, reps: metric, segments: z.array(segmentSchema).max(0) }),
  z.object({ ...setBase, type: z.literal('DROP_SET'), weight: z.null(), reps: z.null(), segments: z.array(segmentSchema) }),
]);
const exerciseSchema = z.object({
  id: z.string(), exerciseId: z.string(), order: z.number().int().nonnegative(),
  exerciseNameSnapshot: z.string(), primaryMuscleSnapshot: z.string(), equipmentSnapshot: z.string(),
  measurementTypeSnapshot: z.enum(['WEIGHT_REPS', 'REPS_ONLY', 'TIME', 'DISTANCE_TIME']),
  notes: z.string().nullable(), sets: z.array(setSchema),
});
export const achievementSchema = z.object({
  type: z.literal('ESTIMATED_1RM_PR'), workoutSetId: z.string(), exerciseId: z.string(),
  previousValue: z.number().finite().nonnegative(), currentValue: z.number().finite().positive(),
});
export type PersonalRecord = z.infer<typeof achievementSchema>;
export const personalRecordsSchema = z.object({ items: z.array(achievementSchema) });
export const sessionSchema = z.object({
  id: z.string(), routineId: z.string().nullable(), name: z.string(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'DISCARDED']), startedAt: z.string().datetime(), endedAt: timestamp,
  exercises: z.array(exerciseSchema),
  achievement: achievementSchema.nullable().optional(),
});
export type LiveSession = z.infer<typeof sessionSchema>;
export type LiveExercise = z.infer<typeof exerciseSchema>;
export type LiveSet = z.infer<typeof setSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export function parseMetric(text: string, integer = false): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!(integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 && (!integer || (Number.isInteger(number) && number <= 2147483647)) ? number : null;
}
export function summary(exercises: LiveExercise[]) {
  let volume = 0, sets = 0, warmups = 0;
  for (const exercise of exercises) for (const set of exercise.sets) {
    if (set.completedAt) { if (set.type === 'WARMUP') warmups++; else sets++; }
    if (exercise.measurementTypeSnapshot !== 'WEIGHT_REPS' || set.type === 'WARMUP') continue;
    for (const item of set.type === 'DROP_SET' ? set.segments : [set]) if (item.completedAt) {
      if (item.weight === null || item.reps === null || !Number.isFinite(item.weight * item.reps)) throw new Error('Série concluída com métricas inválidas.');
      volume += item.weight * item.reps;
      if (!Number.isFinite(volume)) throw new Error('O volume ultrapassa a precisão numérica suportada.');
    }
  }
  return { volume, sets, warmups };
}
export const elapsedSeconds = (session: LiveSession | null, clock: number) => session
  ? Math.max(0, ((session.endedAt ? Date.parse(session.endedAt) : clock) - Date.parse(session.startedAt)) / 1000) : 0;
export function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

const previousSetSchema = z.object({
  type: z.enum(['WORKING', 'WARMUP', 'DROP_SET']), ordinal: z.number().int().positive(),
  weight: metric, reps: metric, completedAt: z.string().datetime(),
  segments: z.array(z.object({ weight: z.number().nonnegative(), reps: z.number().int().nonnegative(), completedAt: z.string().datetime() })),
});
const previousSchema = z.object({
  sessionId: z.string(), workoutExerciseId: z.string(), endedAt: z.string().datetime(), notes: z.string().nullable(),
  measurementTypeSnapshot: z.enum(['WEIGHT_REPS', 'REPS_ONLY', 'TIME', 'DISTANCE_TIME']),
  sets: z.array(previousSetSchema),
});
export const previousPerformanceSchema = z.object({ items: z.array(z.object({
  workoutExerciseId: z.string(), exerciseId: z.string(), previous: previousSchema.nullable(),
})) });
export type PreviousPerformance = z.infer<typeof previousSchema>;
export function previousSetLabels(sets: LiveSet[], previous: PreviousPerformance | null | undefined): Record<string, string> {
  const ordinal = { WORKING: 0, WARMUP: 0, DROP_SET: 0 };
  return Object.fromEntries(sets.map(set => {
    const index = ++ordinal[set.type];
    const prior = previous?.sets.find(item => item.type === set.type && item.ordinal === index);
    const text = !prior || previous?.measurementTypeSnapshot !== 'WEIGHT_REPS' ? '—'
      : prior.type === 'DROP_SET' ? prior.segments.map(segment => `${segment.weight}×${segment.reps}`).join(' › ')
      : prior.weight === null || prior.reps === null ? '—' : `${prior.weight}×${prior.reps}`;
    return [set.id, text];
  }));
}
