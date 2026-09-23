import { eligibleEstimate } from './personal-records.js';

export type MetricSegment = {
  readonly id: string;
  readonly weight: number | null;
  readonly reps: number | null;
  readonly completedAt: Date | null;
};

export type MetricSet = MetricSegment & {
  readonly type: 'WORKING' | 'WARMUP' | 'DROP_SET';
  readonly segments: readonly MetricSegment[];
};

export type MetricExercise = {
  readonly exerciseId: string;
  readonly measurementTypeSnapshot: 'WEIGHT_REPS' | 'REPS_ONLY' | 'TIME' | 'DISTANCE_TIME';
  readonly sets: readonly MetricSet[];
};

export type SessionMetricsInput = {
  readonly sessionId: string;
  readonly exercises: readonly MetricExercise[];
};

export type ExerciseMetrics = {
  exerciseId: string;
  volume: number | null;
  volumeContributionCount: number;
  bestEstimatedOneRepMax: number | null;
  maxWeight: number | null;
};

export type SessionMetrics = {
  sessionId: string;
  volume: number | null;
  volumeContributionCount: number;
  exercises: ExerciseMetrics[];
};

/**
 * The caller must select a COMPLETED session. No status/date filtering happens here.
 * Invalid completed contributions fail explicitly; handling historical inconsistencies
 * belongs to the query service, not to this calculator.
 */
export function calculateSessionMetrics(input: SessionMetricsInput): SessionMetrics {
  const byExercise = new Map<string, ExerciseMetrics>();
  let volume: number | null = null;
  let volumeContributionCount = 0;

  for (const exercise of input.exercises) {
    let result = byExercise.get(exercise.exerciseId);
    if (!result) {
      result = {
        exerciseId: exercise.exerciseId, volume: null, volumeContributionCount: 0,
        bestEstimatedOneRepMax: null, maxWeight: null,
      };
      byExercise.set(exercise.exerciseId, result);
    }
    if (exercise.measurementTypeSnapshot !== 'WEIGHT_REPS') continue;

    for (const set of exercise.sets) {
      if (set.type === 'WARMUP') continue;
      // A completed segment counts even when its DROP_SET parent is incomplete.
      for (const item of set.type === 'DROP_SET' ? set.segments : [set]) {
        if (!item.completedAt) continue;
        const context = `session=${input.sessionId}, exercise=${exercise.exerciseId}, set=${set.id}, item=${item.id}`;
        const { weight, reps } = item;
        if (weight === null || !Number.isFinite(weight) || weight < 0
          || reps === null || !Number.isInteger(reps) || reps < 0 || reps > 2147483647) {
          throw new Error(`Invalid completed metrics (${context}).`);
        }
        const contribution = weight * reps;
        const nextExerciseVolume = (result.volume ?? 0) + contribution;
        const nextSessionVolume = (volume ?? 0) + contribution;
        if (![contribution, nextExerciseVolume, nextSessionVolume].every(Number.isFinite)) {
          throw new Error(`Non-finite volume (${context}).`);
        }
        result.volume = nextExerciseVolume;
        result.volumeContributionCount++;
        volume = nextSessionVolume;
        volumeContributionCount++;
      }

      if (set.type !== 'WORKING' || !set.completedAt) continue;
      // Metrics were validated above; zero is valid for volume, but not a record.
      if (set.weight! > 0 && set.reps! >= 1) {
        result.maxWeight = Math.max(result.maxWeight ?? set.weight!, set.weight!);
      }
      const estimate = eligibleEstimate(set, exercise.measurementTypeSnapshot);
      if (estimate !== null) {
        if (!Number.isFinite(estimate)) {
          throw new Error(`Non-finite e1RM (session=${input.sessionId}, exercise=${exercise.exerciseId}, set=${set.id}).`);
        }
        result.bestEstimatedOneRepMax = Math.max(result.bestEstimatedOneRepMax ?? estimate, estimate);
      }
    }
  }

  return { sessionId: input.sessionId, volume, volumeContributionCount, exercises: [...byExercise.values()] };
}
