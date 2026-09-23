import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProgressStore, presetRange, validRange } from '../state';
import type { WorkoutProgress } from '../../../../shared/workoutProgress';
import type { ProgressRequest } from '../../../../lib/workoutProgress';

function response(id?: string, ids = ['a', 'b']): WorkoutProgress {
  const empty = { value: null, status: 'no_data' as const };
  const records = { maxWeight: empty, bestEstimatedOneRepMax: empty };
  return {
    filter: { startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'America/Fortaleza', startInclusiveUTC: '', endExclusiveUTC: '', exerciseId: id ?? null },
    period: { sessionCount: 2, volume: { value: 0, status: 'available', contributionCount: 1 }, volumeSeries: [] },
    exercises: ids.map(exerciseId => ({ exerciseId, name: exerciseId, periodSessionCount: 1, periodRecords: records, allTimeRecords: records })),
    progression: id ? { exerciseId: id, points: [{ sessionId: id + '-1', startedAt: '2026-09-01T12:00:00Z', localDate: '2026-09-01', bestEstimatedOneRepMax: empty }], nextCursor: 'next' } : null,
    dataQuality: { status: 'complete', issues: [] },
  };
}
const now = new Date(2026, 8, 22, 12);
test('local presets and calendar validation across leap years and year boundaries', () => {
  assert.deepEqual(presetRange('month', now), { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.deepEqual(presetRange('previous', new Date(2026, 0, 1)), { startDate: '2025-12-01', endDate: '2025-12-31' });
  assert.deepEqual(presetRange('30days', new Date(2024, 2, 1)), { startDate: '2024-02-01', endDate: '2024-03-01' });
  assert.equal(validRange({ startDate: '2024-02-29', endDate: '2024-03-01' }), true);
  assert.equal(validRange({ startDate: '2026-02-29', endDate: '2026-03-01' }), false);
  assert.equal(validRange({ startDate: '2026-09-23', endDate: '2026-09-22' }), false);
});
test('initial selection, explicit zone, pagination deduplication and invariant summaries', async () => {
  const calls: ProgressRequest[] = [];
  const store = createProgressStore(async query => {
    calls.push(query); const result = response(query.exerciseId);
    if (query.cursor) { result.period.volume = { value: 999, status: 'available', contributionCount: 1 }; result.progression!.points.push({ ...result.progression!.points[0], sessionId: 'a-2' }); result.progression!.nextCursor = null; }
    return result;
  }, now, 'America/Fortaleza');
  await store.load();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].exerciseId, undefined);
  assert.equal(calls[1].exerciseId, 'a');
  assert.equal(calls[0].timeZone, 'America/Fortaleza');
  await store.more();
  assert.deepEqual(store.getSnapshot().points.map(point => point.sessionId), ['a-1', 'a-2']);
  assert.equal(store.getSnapshot().data!.period.volume.value, 0);
  assert.equal(store.getSnapshot().nextCursor, null);
  await store.select('b');
  assert.deepEqual(store.getSnapshot().points.map(point => point.sessionId), ['b-1']);
});
test('a stale exercise response cannot overwrite a newer selection', async () => {
  let deferred: ((value: WorkoutProgress) => void) | undefined;
  let hold = false;
  const store = createProgressStore(query => hold && query.exerciseId === 'a' ? new Promise(resolve => { deferred = resolve; }) : Promise.resolve(response(query.exerciseId)), now, 'UTC');
  await store.load(); hold = true;
  const pending = store.select('a');
  await store.select('b'); deferred!(response('a')); await pending;
  assert.equal(store.getSnapshot().selectedId, 'b');
  assert.equal(store.getSnapshot().points[0].sessionId, 'b-1');
  store.dispose();
});
test('failed next page preserves points and supports retry; range changes reset the cursor', async () => {
  let fail = true;
  const calls: ProgressRequest[] = [];
  const store = createProgressStore(async query => {
    calls.push(query);
    if (query.cursor && fail) throw new Error('Network');
    return response(query.exerciseId);
  }, now, 'UTC');
  await store.load(); await store.more();
  assert.equal(store.getSnapshot().points.length, 1);
  assert.ok(store.getSnapshot().moreError);
  assert.equal(store.getSnapshot().nextCursor, 'next');
  fail = false; await store.more(); assert.equal(store.getSnapshot().moreError, '');
  await store.load({ startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.equal(calls.at(-1)!.cursor, undefined);
  assert.equal(calls.at(-1)!.startDate, '2026-08-01');
});
test('missing timezone, empty history, no_data and authentication failures remain explicit', async () => {
  let calls = 0;
  const absent = createProgressStore(async () => { calls++; return response(); }, now, '');
  await absent.load(); assert.equal(calls, 0); assert.ok(absent.getSnapshot().error);
  const empty = createProgressStore(async () => response(undefined, []), now, 'UTC');
  await empty.load(); assert.equal(empty.getSnapshot().selectedId, ''); assert.deepEqual(empty.getSnapshot().points, []);
  const unauthorized = createProgressStore(async () => { throw Object.assign(new Error('expired'), { status: 401 }); }, now, 'UTC');
  await unauthorized.load(); assert.equal(unauthorized.getSnapshot().authExpired, true);
});
