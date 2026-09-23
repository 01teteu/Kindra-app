import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSessionMetrics, type MetricExercise, type MetricSet, type SessionMetricsInput } from './workout-metrics.js';
import { estimateOneRepMax } from './estimated-one-rep-max.js';
import { sessionSchema, summary } from '../../components/workout/live/model.js';

const date = new Date('2026-09-01T12:00:00Z');
const set = (overrides: Partial<MetricSet> = {}): MetricSet => ({
  id: 'set', type: 'WORKING', weight: 100, reps: 5, completedAt: date, segments: [], ...overrides,
});
const exercise = (sets: readonly MetricSet[], overrides: Partial<MetricExercise> = {}): MetricExercise => ({
  exerciseId: 'exercise', measurementTypeSnapshot: 'WEIGHT_REPS', sets, ...overrides,
});
const calculate = (...exercises: MetricExercise[]) => calculateSessionMetrics({ sessionId: 'session', exercises });

test('mixed session: partial drops, warmups and incomplete sets match Live volume', () => {
  const exercises = [exercise([
    set(),
    set({ id: 'warmup', type: 'WARMUP', weight: 500 }),
    set({ id: 'incomplete', weight: null, reps: null, completedAt: null }),
    set({ id: 'drop', type: 'DROP_SET', weight: null, reps: null, completedAt: null, segments: [
      { id: 'segment1', weight: 80, reps: 6, completedAt: date },
      { id: 'segment2', weight: 60, reps: 8, completedAt: date },
      { id: 'segment3', weight: 40, reps: 10, completedAt: null },
    ] }),
  ])];
  const result = calculate(...exercises);
  assert.equal(result.volume, 1460);
  assert.equal(result.volumeContributionCount, 3);
  assert.equal(result.exercises[0].maxWeight, 100);
  assert.equal(result.exercises[0].bestEstimatedOneRepMax, estimateOneRepMax(100, 5));

  const live = sessionSchema.parse({
    id: 'session', routineId: null, name: 'Training', status: 'COMPLETED',
    startedAt: date.toISOString(), endedAt: date.toISOString(),
    exercises: exercises.map((item, order) => ({
      ...item, id: `entry-${order}`, order, exerciseNameSnapshot: 'Exercise',
      primaryMuscleSnapshot: 'CHEST', equipmentSnapshot: 'BARBELL', notes: null,
      sets: item.sets.map((entry, index) => ({
        ...entry, workoutExerciseId: `entry-${order}`, setNumber: index + 1, restTime: 0,
        completedAt: entry.completedAt?.toISOString() ?? null,
        segments: entry.segments.map((segment, segmentOrder) => ({
          ...segment, workoutSetId: entry.id, order: segmentOrder,
          completedAt: segment.completedAt?.toISOString() ?? null,
        })),
      })),
    })),
  });
  assert.equal(result.volume, summary(live.exercises).volume);
  live.exercises[0].sets[3].completedAt = date.toISOString();
  const completedParent = calculate(exercise(exercises[0].sets.map(item => item.type === 'DROP_SET' ? { ...item, completedAt: date } : item)));
  assert.deepEqual(completedParent, result);
  assert.equal(completedParent.volume, summary(live.exercises).volume);
});

test('absent volume differs from valid zero; neither creates a record', () => {
  assert.deepEqual(calculate(), { sessionId: 'session', volume: null, volumeContributionCount: 0, exercises: [] });
  for (const sets of [[], [set({ completedAt: null })], [set({ type: 'WARMUP' })]]) {
    assert.deepEqual(calculate(exercise(sets)).exercises[0], {
      exerciseId: 'exercise', volume: null, volumeContributionCount: 0,
      maxWeight: null, bestEstimatedOneRepMax: null,
    });
  }
  for (const entry of [set({ weight: 0 }), set({ reps: 0 })]) {
    const result = calculate(exercise([entry]));
    assert.equal(result.volume, 0);
    assert.equal(result.volumeContributionCount, 1);
    assert.equal(result.exercises[0].maxWeight, null);
    assert.equal(result.exercises[0].bestEstimatedOneRepMax, null);
  }
});

test('e1RM boundaries reuse domain calculation; high-rep load remains eligible', () => {
  for (const reps of [1, 12, 13]) {
    const result = calculate(exercise([set({ reps })])).exercises[0];
    assert.equal(result.volume, 100 * reps);
    assert.equal(result.maxWeight, 100);
    assert.equal(result.bestEstimatedOneRepMax, estimateOneRepMax(100, reps));
  }
  const result = calculate(exercise([set(), set({ weight: 150, reps: 13 })])).exercises[0];
  assert.equal(result.maxWeight, 150);
  assert.equal(result.bestEstimatedOneRepMax, estimateOneRepMax(100, 5));
});

test('dropsets cannot set records, and unsupported measurements infer nothing', () => {
  const drop = set({ type: 'DROP_SET', weight: null, reps: null, segments: [
    { id: 'segment', weight: 200, reps: 1, completedAt: date },
  ] });
  const result = calculate(exercise([drop])).exercises[0];
  assert.equal(result.volume, 200);
  assert.equal(result.maxWeight, null);
  assert.equal(result.bestEstimatedOneRepMax, null);
  for (const measurementTypeSnapshot of ['REPS_ONLY', 'TIME', 'DISTANCE_TIME'] as const) {
    const excluded = calculate(exercise([set({ weight: null })], { measurementTypeSnapshot }));
    assert.equal(excluded.volume, null);
    assert.equal(excluded.exercises[0].maxWeight, null);
    assert.equal(excluded.exercises[0].bestEstimatedOneRepMax, null);
  }
});

test('repeated exercise IDs combine while distinct exercises remain separate', () => {
  const result = calculate(
    exercise([set({ weight: 100, reps: 1 })]),
    exercise([set({ weight: 90, reps: 12 })]),
    exercise([set({ weight: 20, reps: 2 })], { exerciseId: 'other' }),
  );
  assert.equal(result.volume, 1220);
  assert.equal(result.volumeContributionCount, 3);
  assert.equal(result.exercises.length, 2);
  assert.deepEqual(result.exercises[0], {
    exerciseId: 'exercise', volume: 1180, volumeContributionCount: 2,
    maxWeight: 100, bestEstimatedOneRepMax: estimateOneRepMax(90, 12),
  });
  assert.equal(result.exercises[1].volume, 40);
});

test('invalid completed metrics reject explicitly for simple sets and drop segments', () => {
  const invalid = [
    { weight: null }, { reps: null }, { weight: NaN }, { weight: Infinity },
    { weight: -1 }, { reps: NaN }, { reps: Infinity }, { reps: -1 },
    { reps: 1.5 }, { reps: 2147483648 },
  ];
  for (const metrics of invalid) {
    const entry = set(metrics);
    assert.throws(() => calculate(exercise([entry])), /Invalid completed metrics.*session=session.*exercise=exercise.*set=set/);
    assert.throws(() => calculate(exercise([set({ type: 'DROP_SET', segments: [entry] })])), /Invalid completed metrics/);
    assert.equal(calculate(exercise([{ ...entry, completedAt: null }])).volume, null);
  }
  assert.throws(() => calculate(exercise([set({ weight: Number.MAX_VALUE, reps: 2 })])), /Non-finite volume/);
  const huge = exercise([set({ weight: Number.MAX_VALUE, reps: 1 })]);
  assert.throws(() => calculate(huge, huge), /Non-finite volume/);
  assert.throws(() => calculate(huge, { ...huge, exerciseId: 'other' }), /Non-finite volume/);
});

test('calculation is deterministic and leaves frozen input untouched', () => {
  const input: SessionMetricsInput = { sessionId: 'session', exercises: [exercise([set()])] };
  function freeze(value: object) {
    Object.freeze(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  }
  const before = structuredClone(input);
  freeze(input);
  assert.deepEqual(calculateSessionMetrics(input), calculateSessionMetrics(input));
  assert.deepEqual(input, before);
});
