import { estimateOneRepMax } from './estimated-one-rep-max.js';

export type PersonalRecord = {
  type: 'ESTIMATED_1RM_PR'; workoutSetId: string; exerciseId: string;
  previousValue: number; currentValue: number;
};
type RecordSet = {
  id: string; type: string; weight: number | null; reps: number | null;
  completedAt: Date | null; setNumber: number;
};
type RecordExercise = {
  exerciseId: string; order: number; measurementTypeSnapshot: string; sets: RecordSet[];
};

export function eligibleEstimate(set: Pick<RecordSet, 'type' | 'weight' | 'reps' | 'completedAt'>, measurement: string) {
  if (set.type !== 'WORKING' || measurement !== 'WEIGHT_REPS' || !set.completedAt || set.weight === null || set.reps === null) return null;
  return estimateOneRepMax(set.weight, set.reps);
}

export function reconstructPersonalRecords(exercises: RecordExercise[], baseline: ReadonlyMap<string, number>): PersonalRecord[] {
  const best = new Map(baseline);
  const ordered = exercises.flatMap(exercise => exercise.sets.map(set => ({ exercise, set })))
    .filter(({ exercise, set }) => eligibleEstimate(set, exercise.measurementTypeSnapshot) !== null)
    .sort((a, b) => a.set.completedAt!.getTime() - b.set.completedAt!.getTime()
      || a.exercise.order - b.exercise.order || a.set.setNumber - b.set.setNumber
      || (a.set.id < b.set.id ? -1 : a.set.id > b.set.id ? 1 : 0));
  const records: PersonalRecord[] = [];
  for (const { exercise, set } of ordered) {
    const current = eligibleEstimate(set, exercise.measurementTypeSnapshot)!;
    const previous = best.get(exercise.exerciseId);
    // No historical baseline: the entire first session establishes it silently.
    if (previous === undefined || current <= previous) continue;
    records.push({ type: 'ESTIMATED_1RM_PR', workoutSetId: set.id, exerciseId: exercise.exerciseId,
      previousValue: Math.round(previous * 10) / 10, currentValue: Math.round(current * 10) / 10 });
    best.set(exercise.exerciseId, current);
  }
  return records;
}
