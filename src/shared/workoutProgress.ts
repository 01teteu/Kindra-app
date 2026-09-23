export type ProgressMetric =
  | { value: number; status: 'available' }
  | { value: null; status: 'no_data' | 'incomplete' };

export type ProgressVolume = ProgressMetric & {
  // Unknown when calculation is incomplete; never a partial count presented as complete.
  contributionCount: number | null;
};
export type ProgressRecords = { maxWeight: ProgressMetric; bestEstimatedOneRepMax: ProgressMetric };
export type ProgressExercise = {
  exerciseId: string;
  name: string;
  periodSessionCount: number;
  periodRecords: ProgressRecords;
  allTimeRecords: ProgressRecords;
};
export type ProgressPoint = {
  sessionId: string;
  startedAt: string;
  localDate: string;
  bestEstimatedOneRepMax: ProgressMetric;
};
export type ProgressIssue = {
  code: 'INVALID_METRICS' | 'NUMERIC_OVERFLOW';
  scope: 'period' | 'all_time';
  indicator: 'volume' | 'records';
  exerciseId: string | null;
  occurrences: number;
};
export type WorkoutProgress = {
  filter: {
    startDate: string; endDate: string; timeZone: string;
    startInclusiveUTC: string; endExclusiveUTC: string; exerciseId: string | null;
  };
  period: {
    sessionCount: number;
    volume: ProgressVolume;
    volumeSeries: { localDate: string; sessionCount: number; volume: ProgressVolume }[];
  };
  exercises: ProgressExercise[];
  progression: { exerciseId: string; points: ProgressPoint[]; nextCursor: string | null } | null;
  dataQuality: { status: 'complete' | 'incomplete'; issues: ProgressIssue[] };
};
