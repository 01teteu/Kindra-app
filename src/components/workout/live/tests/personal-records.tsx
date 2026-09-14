import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLiveWorkoutStore } from '../state';
import { SetRow } from '../SetRow';
import { sessionSchema, personalRecordsSchema, type LiveSession, type PersonalRecord } from '../model';
import { workoutApi } from '../api';
const date = '2020-01-01T00:00:00.000Z';
const sample: LiveSession = { id: 's1', routineId: null, name: 'PR', status: 'ACTIVE', startedAt: date, endedAt: null, exercises: [{
  id: 'ex', exerciseId: 'catalog', order: 0, exerciseNameSnapshot: 'Supino', equipmentSnapshot: 'BARBELL', primaryMuscleSnapshot: 'CHEST',
  measurementTypeSnapshot: 'WEIGHT_REPS', notes: null, sets: [
    { id: 'set', workoutExerciseId: 'ex', type: 'WORKING', setNumber: 1, restTime: 0, weight: 100, reps: 4, completedAt: date, segments: [] },
  ],
}] };
const pr: PersonalRecord = { type: 'ESTIMATED_1RM_PR', workoutSetId: 'set', exerciseId: 'catalog', previousValue: 112.4, currentValue: 113.3 };
let current = structuredClone(sample);
const reads: Array<{ id: string; resolve: (value: { items: PersonalRecord[] }) => void; reject: (error: Error) => void }> = [];
let finishWrite: (() => void) | undefined;
let writeGate: Promise<void> | undefined;
const store = createLiveWorkoutStore({
  async active() { return current; },
  async previous() { return { items: [] }; },
  async mutate() { await writeGate; return current; },
  personalRecords(id: string) { return new Promise((resolve, reject) => reads.push({ id, resolve, reject })); },
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const markup = () => renderToStaticMarkup(createElement(SetRow, { set: store.getSnapshot().session!.exercises[0].sets[0],
  number: 1, disabled: false, isNext: false, store, base: '/s1/exercises/ex' }));
const gold = () => markup().includes(' is-pr');
await Promise.all([store.load(), store.load()]);
assert.equal(reads.length, 1); // StrictMode shares concurrent hydration.
assert.equal(reads[0].id, 's1');
assert.equal(gold(), false); // no local calculation, even with eligible metrics
reads[0].resolve({ items: [pr] }); await flush();
assert.equal(gold(), true);
assert.ok(markup().includes('<strong>Novo PR</strong>'));
assert.ok(markup().includes('<span>e1RM 113,3 kg</span>'));
assert.ok(markup().includes('aria-atomic="true"'));

current = { ...structuredClone(sample), achievement: null };
current.exercises[0].sets[0].completedAt = null;
await store.mutate('set', '/s1/exercises/ex/sets/set/completion', 'PATCH', { completed: false });
assert.equal(gold(), false);
reads.at(-1)!.resolve({ items: [pr] }); await flush(); // even a malformed stale set cannot mark an open row
assert.equal(gold(), false);
current = { ...structuredClone(sample), achievement: null };
await store.mutate('set', '/s1/exercises/ex/sets/set/completion', 'PATCH', { completed: true });
assert.equal(gold(), false);

// Delay the write: no PR until its backend response; a preceding GET is obsolete.
const oldRead = reads.at(-1)!;
current = { ...structuredClone(sample), achievement: pr };
writeGate = new Promise(resolve => { finishWrite = resolve; });
const writing = store.mutate('set', '/s1/exercises/ex/sets/set/completion', 'PATCH', { completed: true });
await flush(); oldRead.resolve({ items: [pr] }); await flush();
assert.equal(gold(), false);
finishWrite!(); await writing; writeGate = undefined;
assert.equal(gold(), true);

const obsoleteSessionRead = reads.at(-1)!;
current = { ...structuredClone(sample), id: 's2' };
await store.load();
obsoleteSessionRead.resolve({ items: [pr] }); await flush();
assert.deepEqual(store.getSnapshot().personalRecords, {});
assert.equal(gold(), false);
reads.at(-1)!.resolve(personalRecordsSchema.parse({ items: [pr] })); await flush();
assert.equal(gold(), true);

// Two hydration responses for the same session must obey request generation.
await store.load(); const oldHydration = reads.at(-1)!;
await store.load(); reads.at(-1)!.resolve({ items: [] }); await flush();
oldHydration.resolve({ items: [pr] }); await flush();
assert.equal(gold(), false);
await store.load(); reads.at(-1)!.reject(new Error('offline')); await flush();
assert.ok(store.getSnapshot().personalRecordsError);
assert.equal(store.getSnapshot().unavailable, false);

for (const type of ['WARMUP', 'DROP_SET'] as const) {
  current = { ...structuredClone(sample), achievement: pr };
  const original = current.exercises[0].sets[0];
  current.exercises[0].sets[0] = type === 'DROP_SET'
    ? { ...original, type, weight: null, reps: null }
    : { ...original, type };
  await store.load(); reads.at(-1)!.resolve({ items: [pr] }); await flush();
  await store.mutate('set', '/s1/exercises/ex/sets/set/completion', 'PATCH', { completed: true });
  assert.equal(gold(), false);
}
current = { ...structuredClone(sample), achievement: { ...pr, exerciseId: 'wrong' } };
await store.load();
await store.mutate('set', '/s1/exercises/ex/sets/set/completion', 'PATCH', { completed: true });
assert.equal(gold(), false);
// Real API parsing preserves completion achievements and GET contract.
const originalFetch = globalThis.fetch;
try {
  const paths: string[] = [];
  globalThis.fetch = async input => {
    const path = String(input); paths.push(path);
    return new Response(JSON.stringify(path.endsWith('/personal-records') ? { items: [pr] } : { ...sample, achievement: pr }), { status: 200 });
  };
  assert.deepEqual((await workoutApi.mutate('/s1/completion', 'PATCH', { completed: true })).achievement, pr);
  assert.deepEqual(await workoutApi.personalRecords('s1'), { items: [pr] });
  assert.ok(paths.includes('/api/workouts/sessions/s1/personal-records'));
  assert.equal(sessionSchema.parse({ ...sample, achievement: null }).achievement, null);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS PR confirmado, null, reopen, hidratação, respostas obsoletas, WARMUP/DROP, erro recuperável e contrato HTTP.');
