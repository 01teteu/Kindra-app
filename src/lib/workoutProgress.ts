import { apiFetch } from './api';
import type { WorkoutProgress } from '../shared/workoutProgress';

export type ProgressRequest = {
  startDate: string; endDate: string; timeZone: string;
  exerciseId?: string; cursor?: string;
};
export function fetchWorkoutProgress(query: ProgressRequest, signal?: AbortSignal): Promise<WorkoutProgress> {
  const params = new URLSearchParams({ startDate: query.startDate, endDate: query.endDate, timeZone: query.timeZone, limit: '200' });
  if (query.exerciseId) params.set('exerciseId', query.exerciseId);
  if (query.cursor) params.set('cursor', query.cursor);
  return apiFetch(`/workouts/progress?${params}`, { signal });
}
