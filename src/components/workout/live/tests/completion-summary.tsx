import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { completionSummary } from '../completion-summary';
import { WorkoutCompletionSummary } from '../WorkoutCompletionSummary';
import { createLiveWorkoutStore } from '../state';
import type { LiveSession, LiveSet, PersonalRecord } from '../model';

const start = '2020-01-01T10:00:00.000Z', end = '2020-01-01T11:12:59.000Z';
const set = (id: string, type: 'WORKING' | 'WARMUP' = 'WORKING'): LiveSet => ({ id, workoutExerciseId: 'ex', type, setNumber: 1,
  weight: 100, reps: 1, completedAt: end, restTime: 0, segments: [] });
const session: LiveSession = { id: 'session', routineId: null, name: 'Push A', status: 'COMPLETED', startedAt: start, endedAt: end, exercises: [
  { id: 'ex', exerciseId: 'catalog', order: 0, exerciseNameSnapshot: 'Supino histórico', equipmentSnapshot: 'BARBELL', primaryMuscleSnapshot: 'CHEST', measurementTypeSnapshot: 'WEIGHT_REPS', notes: null,
    sets: [set('a'), set('b'), set('warmup', 'WARMUP'), { ...set('open'), completedAt: null },
      { ...set('drop'), type: 'DROP_SET', weight: null, reps: null, segments: [0, 1, 2].map(order => ({ id: `seg${order}`, workoutSetId: 'drop', order, weight: 80, reps: 5, completedAt: end })) }] },
] };
session.exercises.push({ ...session.exercises[0], id: 'duplicate', order: 1, sets: [set('c')] });
session.exercises.push({ ...session.exercises[0], id: 'other', exerciseId: 'other-catalog', exerciseNameSnapshot: 'Desenvolvimento histórico', order: 2, sets: [set('d')] });
const pr = (workoutSetId: string, currentValue: number, exerciseId = 'catalog'): PersonalRecord => ({
  type: 'ESTIMATED_1RM_PR', workoutSetId, exerciseId, previousValue: 99, currentValue,
});
const records = [pr('a', 105), pr('b', 110), pr('c', 115), pr('d', 72.8, 'other-catalog')];
const result = completionSummary(session, records)!;
assert.equal(result.name, 'Push A'); assert.equal(result.duration, '1h 12min');
assert.equal(result.exerciseCount, 3); // occurrences, not unique catalog IDs
assert.equal(result.setCount, 6); // three working in first/duplicate + other + warmup + logical drop
assert.deepEqual(result.records.map(record => [record.name, record.currentValue]), [['Supino histórico', 115], ['Desenvolvimento histórico', 72.8]]);
assert.deepEqual(completionSummary(session, [pr('warmup', 999), pr('drop', 999), pr('open', 999), pr('seg0', 999)])!.records, []);
assert.equal(completionSummary({ ...session, endedAt: '2020-01-01T10:47:59.000Z' }, [])!.duration, '47 min');
assert.equal(completionSummary({ ...session, endedAt: start }, [])!.duration, 'Menos de 1 min');
assert.throws(() => completionSummary({ ...session, endedAt: null }, []), /timestamps/);
assert.equal(completionSummary({ ...session, status: 'DISCARDED' }, records), null);
const render = (source = session, items = records, recordsLoading = false, recordsError = '') => renderToStaticMarkup(createElement(WorkoutCompletionSummary, {
  session: source, records: items, recordsLoading, recordsError, onClose() {}, onRetry() {},
}));
assert.ok(render().includes('Treino concluído')); assert.ok(render().includes('e1RM 115 kg'));
assert.ok(render().includes('e1RM 72,8 kg')); assert.ok(!render().includes('Volume'));
assert.ok(!render(session, []).includes('Novos recordes'));
assert.ok(!render(session, records, true).includes('Novos recordes'));
assert.ok(render(session, records, false, 'PRs indisponíveis').includes('Tentar novamente'));
assert.equal(render({ ...session, status: 'DISCARDED' }), '');

// Finish retains its response and fetches COMPLETED records, independently of GET active.
let current = { ...session, status: 'ACTIVE' as LiveSession['status'], endedAt: null };
let recordRequests = 0;
const reads: Array<(value: { items: PersonalRecord[] }) => void> = [];
const store = createLiveWorkoutStore({
  async active() { return current; }, async previous() { return { items: [] }; },
  async mutate(path) { return { ...session, status: path.endsWith('discard') ? 'DISCARDED' : 'COMPLETED' }; },
  personalRecords() { recordRequests++; return new Promise(resolve => reads.push(resolve)); },
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
await store.load();
await store.mutate('end', '/session/finish', 'POST');
assert.equal(store.getSnapshot().session!.status, 'COMPLETED');
assert.equal(store.getSnapshot().session!.endedAt, end);
assert.equal(recordRequests, 2);
reads[0]({ items: [pr('a', 999)] }); await flush();
assert.deepEqual(store.getSnapshot().personalRecords, {});
reads[1]({ items: records }); await flush();
assert.equal(store.getSnapshot().personalRecordsLoading, false);
assert.ok(render(store.getSnapshot().session!, Object.values(store.getSnapshot().personalRecords)).includes('e1RM 115 kg'));
store.refreshRecords(); store.clearClosed(); reads[2]({ items: records }); await flush();
assert.equal(store.getSnapshot().session, null);
assert.deepEqual(store.getSnapshot().personalRecords, {});
current = { ...current, id: 'discard-session' };
await store.load(); const beforeDiscard = recordRequests;
await store.mutate('end', '/discard-session/discard', 'POST');
assert.equal(recordRequests, beforeDiscard);
assert.equal(completionSummary(store.getSnapshot().session!, records), null);
console.log('PASS resumo: finish preservado, timestamps, ocorrências, WORKING/WARMUP/DROP, incompletas, snapshots, agregação, zero PR, loading/erro e discard.');
