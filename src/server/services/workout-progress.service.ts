import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { calculateSessionMetrics, type MetricExercise } from '../domain/workout-metrics.js';
import type { WorkoutProgressQuery } from '../schemas/workout.schema.js';
import type {
  WorkoutProgress, ProgressExercise, ProgressIssue, ProgressMetric, ProgressPoint, ProgressRecords, ProgressVolume,
} from '../../shared/workoutProgress.js';

export class ProgressExerciseNotFoundError extends Error {
  constructor() { super('Exercício não encontrado no histórico concluído.'); }
}

export type ProgressSession = {
  id: string; startedAt: Date;
  exercises: (MetricExercise & { exerciseNameSnapshot: string })[];
};
const emptyMetric = (): ProgressMetric => ({ value: null, status: 'no_data' });
const emptyVolume = (): ProgressVolume => ({ ...emptyMetric(), contributionCount: 0 });
const emptyRecords = (): ProgressRecords => ({ maxWeight: emptyMetric(), bestEstimatedOneRepMax: emptyMetric() });
const metric = (value: number | null): ProgressMetric => value === null ? emptyMetric() : { value, status: 'available' };
function mergeMax(a: ProgressMetric, b: ProgressMetric): ProgressMetric {
  if (a.status === 'incomplete' || b.status === 'incomplete') return { value: null, status: 'incomplete' };
  if (a.value === null) return b;
  if (b.value === null) return a;
  return metric(Math.max(a.value, b.value));
}
function mergeRecords(a: ProgressRecords, b: ProgressRecords): ProgressRecords {
  return { maxWeight: mergeMax(a.maxWeight, b.maxWeight), bestEstimatedOneRepMax: mergeMax(a.bestEstimatedOneRepMax, b.bestEstimatedOneRepMax) };
}

/** Pure aggregation over ordered streams; database failures propagate to the controller. */
export async function collectWorkoutProgress(
  query: WorkoutProgressQuery,
  history: AsyncIterable<ProgressSession>,
  period: AsyncIterable<ProgressSession>,
  report: (error: Error) => void = error => console.error('[WorkoutProgress metrics]', error),
): Promise<WorkoutProgress> {
  const exercises = new Map<string, ProgressExercise>();
  const issues = new Map<string, ProgressIssue>();
  const days = new Map<string, WorkoutProgress['period']['volumeSeries'][number]>();
  const points: ProgressPoint[] = [];
  let totalVolume = emptyVolume();
  let sessionCount = 0;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: query.timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const localDate = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
    return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
  };
  const issue = (code: ProgressIssue['code'], scope: ProgressIssue['scope'], indicator: ProgressIssue['indicator'], exerciseId: string | null) => {
    const key = JSON.stringify([code, scope, indicator, exerciseId]);
    const current = issues.get(key);
    if (current) current.occurrences++;
    else issues.set(key, { code, scope, indicator, exerciseId, occurrences: 1 });
  };
  const calculate = (sessionId: string, entries: MetricExercise[], scope: ProgressIssue['scope'], indicator: ProgressIssue['indicator']) => {
    try {
      return calculateSessionMetrics({ sessionId, exercises: entries });
    } catch (error) {
      // The existing domain exposes Error rather than a typed error. Recognize only
      // its explicit integrity failures; programming/unexpected errors remain 500s.
      if (!(error instanceof Error) || !/^(Invalid completed metrics|Non-finite volume|Non-finite e1RM) \(/.test(error.message)) throw error;
      report(error);
      issue(error.message.startsWith('Invalid') ? 'INVALID_METRICS' : 'NUMERIC_OVERFLOW', scope, indicator, entries[0].exerciseId);
      return null;
    }
  };
  const addVolume = (a: ProgressVolume, b: ProgressVolume): ProgressVolume => {
    if (a.status === 'incomplete' || b.status === 'incomplete') return { value: null, status: 'incomplete', contributionCount: null };
    const count = a.contributionCount! + b.contributionCount!;
    const sum = (a.value ?? 0) + (b.value ?? 0);
    if (!Number.isFinite(sum) || !Number.isSafeInteger(count)) {
      issue('NUMERIC_OVERFLOW', 'period', 'volume', null);
      return { value: null, status: 'incomplete', contributionCount: null };
    }
    return { ...metric(count ? sum : null), contributionCount: count };
  };
  const groups = (session: ProgressSession) => {
    const grouped = new Map<string, ProgressSession['exercises']>();
    for (const entry of session.exercises) {
      const list = grouped.get(entry.exerciseId) ?? [];
      list.push(entry);
      grouped.set(entry.exerciseId, list);
    }
    return grouped;
  };
  const records = (sessionId: string, entries: MetricExercise[], scope: ProgressIssue['scope']): ProgressRecords => {
    // Separating WORKING from drops isolates record metrics from invalid drop segments.
    const result = calculate(sessionId, entries.map(entry => ({ ...entry, sets: entry.sets.filter(set => set.type === 'WORKING') })), scope, 'records');
    if (!result) return { maxWeight: { value: null, status: 'incomplete' }, bestEstimatedOneRepMax: { value: null, status: 'incomplete' } };
    const value = result.exercises[0];
    return { maxWeight: metric(value.maxWeight), bestEstimatedOneRepMax: metric(value.bestEstimatedOneRepMax) };
  };

  // Streams are chronological, so the latest snapshot wins deterministically.
  for await (const session of history) {
    for (const [exerciseId, entries] of groups(session)) {
      const current = exercises.get(exerciseId) ?? {
        exerciseId, name: '', periodSessionCount: 0, periodRecords: emptyRecords(), allTimeRecords: emptyRecords(),
      };
      current.name = entries.at(-1)!.exerciseNameSnapshot;
      current.allTimeRecords = mergeRecords(current.allTimeRecords, records(session.id, entries, 'all_time'));
      exercises.set(exerciseId, current);
    }
  }
  if (query.exerciseId && !exercises.has(query.exerciseId)) throw new ProgressExerciseNotFoundError();

  for await (const session of period) {
    sessionCount++;
    const dayKey = localDate(session.startedAt);
    const day = days.get(dayKey) ?? { localDate: dayKey, sessionCount: 0, volume: emptyVolume() };
    day.sessionCount++;
    let sessionVolume = emptyVolume();
    for (const [exerciseId, entries] of groups(session)) {
      const current = exercises.get(exerciseId);
      if (!current) throw new Error('Period/history snapshot mismatch');
      current.periodSessionCount++;
      const computed = calculate(session.id, entries, 'period', 'volume');
      const volume: ProgressVolume = computed
        ? { ...metric(computed.volume), contributionCount: computed.volumeContributionCount }
        : { value: null, status: 'incomplete', contributionCount: null };
      sessionVolume = addVolume(sessionVolume, volume);
      const sessionRecords = records(session.id, entries, 'period');
      current.periodRecords = mergeRecords(current.periodRecords, sessionRecords);

      const afterCursor = !query.cursor || session.startedAt.getTime() > Date.parse(query.cursor.startedAt)
        || (session.startedAt.getTime() === Date.parse(query.cursor.startedAt) && session.id > query.cursor.sessionId);
      if (exerciseId === query.exerciseId && afterCursor && points.length <= query.limit) {
        points.push({ sessionId: session.id, startedAt: session.startedAt.toISOString(), localDate: dayKey, bestEstimatedOneRepMax: sessionRecords.bestEstimatedOneRepMax });
      }
    }
    day.volume = addVolume(day.volume, sessionVolume);
    totalVolume = addVolume(totalVolume, sessionVolume);
    days.set(dayKey, day);
  }
  const page = points.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor = points.length > query.limit && last ? Buffer.from(JSON.stringify({
    startedAt: last.startedAt, sessionId: last.sessionId, startDate: query.startDate,
    endDate: query.endDate, timeZone: query.timeZone, exerciseId: query.exerciseId,
  })).toString('base64url') : null;
  return {
    filter: {
      startDate: query.startDate, endDate: query.endDate, timeZone: query.timeZone,
      startInclusiveUTC: query.startInclusiveUTC.toISOString(), endExclusiveUTC: query.endExclusiveUTC.toISOString(),
      exerciseId: query.exerciseId ?? null,
    },
    period: { sessionCount, volume: totalVolume, volumeSeries: [...days.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)) },
    exercises: [...exercises.values()].sort((a, b) => a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0),
    progression: query.exerciseId ? { exerciseId: query.exerciseId, points: page, nextCursor } : null,
    dataQuality: { status: issues.size ? 'incomplete' : 'complete', issues: [...issues.values()] },
  };
}

const setSelect = {
  id: true, type: true, weight: true, reps: true, completedAt: true,
} satisfies Prisma.WorkoutSetSelect;

async function* readSessions(tx: Prisma.TransactionClient, userId: string, query: WorkoutProgressQuery, historical: boolean): AsyncGenerator<ProgressSession> {
  let cursor: { id: string; startedAt: Date } | undefined;
  const batchSize = 200;
  for (;;) {
    const sessions = await tx.workoutSession.findMany({
      where: {
        userId, status: 'COMPLETED',
        ...(!historical ? { startedAt: { gte: query.startInclusiveUTC, lt: query.endExclusiveUTC } } : {}),
        ...(cursor ? { OR: [{ startedAt: { gt: cursor.startedAt } }, { startedAt: cursor.startedAt, id: { gt: cursor.id } }] } : {}),
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], take: batchSize,
      select: {
        id: true, startedAt: true,
        exercises: {
          orderBy: { order: 'asc' },
          select: {
            exerciseId: true, exerciseNameSnapshot: true, measurementTypeSnapshot: true,
            sets: historical
              ? { where: { type: 'WORKING', completedAt: { not: null } }, select: setSelect }
              : { select: { ...setSelect, segments: { select: { id: true, weight: true, reps: true, completedAt: true } } } },
          },
        },
      },
    });
    for (const session of sessions) {
      yield { ...session, exercises: session.exercises.map(entry => ({ ...entry, sets: entry.sets.map(set => ({
        ...set, segments: 'segments' in set ? set.segments as { id: string; weight: number; reps: number; completedAt: Date | null }[] : [],
      })) })) };
    }
    if (sessions.length < batchSize) return;
    cursor = sessions.at(-1)!;
  }
}

export function getWorkoutProgress(userId: string, query: WorkoutProgressQuery): Promise<WorkoutProgress> {
  // Both scans see the same committed history, without locks or session mutations.
  return prisma.$transaction(tx => collectWorkoutProgress(
    query, readSessions(tx, userId, query, true), readSessions(tx, userId, query, false),
  ), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
}
