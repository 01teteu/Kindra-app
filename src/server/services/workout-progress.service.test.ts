import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectWorkoutProgress, ProgressExerciseNotFoundError, type ProgressSession } from './workout-progress.service.js';
import { workoutProgressQuerySchema } from '../schemas/workout.schema.js';
import type { MetricSet } from '../domain/workout-metrics.js';

const exerciseId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const input = { startDate: '2026-09-01', endDate: '2026-09-22', timeZone: 'America/Fortaleza', exerciseId };
const query = workoutProgressQuerySchema.parse(input);
const date = new Date('2026-09-01T12:00:00Z');
const set = (overrides: Partial<MetricSet> = {}): MetricSet => ({
  id: 'set', type: 'WORKING', weight: 100, reps: 5, completedAt: date, segments: [], ...overrides,
});
const session = (index: number, sets: MetricSet[] = [set()]): ProgressSession => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, startedAt: date,
  exercises: [{ exerciseId, exerciseNameSnapshot: 'Snapshot', measurementTypeSnapshot: 'WEIGHT_REPS', sets }],
});
async function* stream(rows: ProgressSession[]) { yield* rows; }
const collect = (history: ProgressSession[], period = history, parsed = query) => collectWorkoutProgress(parsed, stream(history), stream(period), () => {});

test('historical and period maxima are independent; pagination never changes summaries', async () => {
  const old = { ...session(1, [set({ weight: 150, reps: 13 })]), startedAt: new Date('2020-01-01') };
  const first = session(2);
  first.exercises.push({ ...first.exercises[0], sets: [set({ weight: 80, reps: 10 })] });
  const second = session(3, [set({ weight: 120, reps: 1 })]);
  second.exercises[0].exerciseNameSnapshot = 'Latest snapshot';
  const history = [old, first, second];
  const full = await collect(history, [first, second]);
  assert.equal(full.period.volume.value, 1420);
  assert.equal(full.period.volume.contributionCount, 3);
  assert.equal(full.period.volumeSeries.length, 1);
  assert.equal(full.period.volumeSeries[0].sessionCount, 2);
  assert.equal(full.exercises[0].name, 'Latest snapshot');
  assert.equal(full.exercises[0].periodSessionCount, 2);
  assert.equal(full.exercises[0].periodRecords.maxWeight.value, 120);
  assert.equal(full.exercises[0].allTimeRecords.maxWeight.value, 150);
  assert.equal(full.exercises[0].allTimeRecords.bestEstimatedOneRepMax.value, 120);
  assert.equal(full.progression!.points.length, 2);
  const page = await collect(history, [first, second], workoutProgressQuerySchema.parse({ ...input, limit: 1 }));
  assert.deepEqual(page.period, full.period);
  assert.deepEqual(page.exercises, full.exercises);
  assert.equal(page.progression!.points[0].sessionId, first.id);
  const next = await collect(history, [first, second], workoutProgressQuerySchema.parse({ ...input, limit: 1, cursor: page.progression!.nextCursor }));
  assert.equal(next.progression!.points[0].sessionId, second.id);
  assert.equal(next.progression!.nextCursor, null);
  assert.deepEqual(next.period, full.period);
  assert.throws(() => workoutProgressQuerySchema.parse({ ...input, exerciseId: otherId, cursor: page.progression!.nextCursor }));
});

test('null, zero and empty periods retain distinct meanings', async () => {
  const empty = await collect([], [], workoutProgressQuerySchema.parse({ ...input, exerciseId: undefined }));
  assert.equal(empty.period.volume.value, null);
  assert.equal(empty.period.volume.status, 'no_data');
  assert.equal(empty.progression, null);
  assert.deepEqual(empty.period.volumeSeries, []);
  const zero = await collect([session(1, [set({ weight: 0 })])]);
  assert.deepEqual(zero.period.volume, { value: 0, status: 'available', contributionCount: 1 });
  assert.equal(zero.exercises[0].allTimeRecords.maxWeight.status, 'no_data');
  const unfinished = await collect([session(1, [set({ completedAt: null, weight: null }), set({ type: 'WARMUP' })])]);
  assert.equal(unfinished.period.volume.status, 'no_data');
  const noPeriod = await collect([session(1)], []);
  assert.equal(noPeriod.exercises[0].allTimeRecords.maxWeight.value, 100);
  assert.equal(noPeriod.exercises[0].periodRecords.maxWeight.status, 'no_data');
  await assert.rejects(collect([], []), ProgressExerciseNotFoundError);
});

test('partial drops count individually; an invalid segment affects volume but not working records', async () => {
  const drop = set({ type: 'DROP_SET', weight: null, reps: null, completedAt: null, segments: [
    { id: 'done', weight: 50, reps: 5, completedAt: date },
    { id: 'pending', weight: 30, reps: 8, completedAt: null },
  ] });
  const valid = await collect([session(1, [set(), drop])]);
  assert.equal(valid.period.volume.value, 750);
  const bad = session(1, [set(), { ...drop, segments: [{ ...drop.segments[0], weight: null }] }]);
  const later = { ...session(2), startedAt: new Date('2026-09-02T12:00:00Z') };
  const result = await collect([bad, later]);
  assert.deepEqual(result.period.volume, { value: null, status: 'incomplete', contributionCount: null });
  assert.equal(result.period.volumeSeries[0].volume.status, 'incomplete');
  assert.equal(result.period.volumeSeries[1].volume.value, 500);
  assert.equal(result.exercises[0].allTimeRecords.maxWeight.value, 100);
  assert.equal(result.exercises[0].periodRecords.maxWeight.value, 100);
  assert.equal(result.progression!.points[0].bestEstimatedOneRepMax.status, 'available');
  assert.deepEqual(result.dataQuality.issues, [{ code: 'INVALID_METRICS', scope: 'period', indicator: 'volume', exerciseId, occurrences: 1 }]);
});

test('invalid working records outside the period taint only that exercise historical records', async () => {
  const bad = { ...session(1, [set({ weight: null })]), startedAt: new Date('2020-01-01') };
  bad.exercises.push({ ...session(2).exercises[0], exerciseId: otherId });
  const good = session(2);
  const result = await collect([bad, good], [good]);
  assert.equal(result.period.volume.status, 'available');
  assert.equal(result.exercises[0].periodRecords.maxWeight.value, 100);
  assert.equal(result.exercises[0].allTimeRecords.maxWeight.status, 'incomplete');
  assert.equal(result.exercises[0].allTimeRecords.bestEstimatedOneRepMax.value, null);
  assert.equal(result.exercises[1].allTimeRecords.maxWeight.value, 100);
  const inPeriod = await collect([good, { ...bad, startedAt: date }]);
  assert.equal(inPeriod.exercises[0].periodRecords.maxWeight.status, 'incomplete');
  assert.equal(inPeriod.progression!.points[1].bestEstimatedOneRepMax.status, 'incomplete');
});

test('aggregate overflow cannot turn partial values into a complete period total', async () => {
  const a = session(1, [set({ weight: Number.MAX_VALUE, reps: 1 })]);
  const b = { ...session(2, [set({ weight: Number.MAX_VALUE, reps: 1 })]), startedAt: new Date('2026-09-02T12:00:00Z') };
  const result = await collect([a, b]);
  assert.equal(result.period.volume.status, 'incomplete');
  assert.equal(result.period.volume.value, null);
  assert.ok(result.period.volumeSeries.every(day => day.volume.status === 'available'));
  assert.equal(result.exercises[0].allTimeRecords.maxWeight.value, Number.MAX_VALUE);
  assert.ok(result.dataQuality.issues.some(issue => issue.code === 'NUMERIC_OVERFLOW'));
});

test('stream failures and unexpected structural errors are not converted into no_data', async () => {
  async function* failing(): AsyncGenerator<ProgressSession> { throw new Error('database unavailable'); }
  await assert.rejects(collectWorkoutProgress(query, failing(), stream([])), /database unavailable/);
  const broken = session(1);
  broken.exercises[0] = { ...broken.exercises[0], sets: null as unknown as MetricSet[] };
  await assert.rejects(collect([broken]), TypeError);
});

test('local dates respect the selected zone and do not insert empty days', async () => {
  const a = { ...session(1), startedAt: new Date('2026-09-02T02:59:59Z') };
  const b = { ...session(2), startedAt: new Date('2026-09-04T03:00:00Z') };
  const result = await collect([a, b]);
  assert.deepEqual(result.period.volumeSeries.map(day => day.localDate), ['2026-09-01', '2026-09-04']);
});
