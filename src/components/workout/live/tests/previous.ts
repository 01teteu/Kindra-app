import assert from 'node:assert/strict';
import { previousSetLabels, previousPerformanceSchema, type LiveSession, type LiveSet } from '../model';
import { createLiveWorkoutStore } from '../state';
const date = '2020-01-01T00:00:00.000Z';
const response = previousPerformanceSchema.parse({ items: [{ workoutExerciseId: 'ex', exerciseId: 'catalog', previous: {
  sessionId: 'old', workoutExerciseId: 'old-ex', endedAt: date, notes: 'Nota histórica', measurementTypeSnapshot: 'WEIGHT_REPS',
  sets: [
    { type: 'WARMUP', ordinal: 1, weight: 10, reps: 12, completedAt: date, segments: [] },
    { type: 'WORKING', ordinal: 1, weight: 30, reps: 8, completedAt: date, segments: [] },
    { type: 'DROP_SET', ordinal: 1, weight: null, reps: null, completedAt: date, segments: [
      { weight: 25, reps: 8, completedAt: date }, { weight: 20, reps: 6, completedAt: date },
    ] },
  ],
} }] });
const previous = response.items[0].previous!;
const sets: LiveSet[] = ['WORKING', 'WARMUP', 'WORKING', 'DROP_SET', 'WARMUP', 'DROP_SET'].map((type, index) => ({
  id: String(index), workoutExerciseId: 'ex', type, setNumber: index + 3, restTime: 0, weight: null, reps: null, completedAt: null, segments: [],
})) as LiveSet[];
assert.deepEqual(Object.values(previousSetLabels(sets, previous)), ['30×8', '10×12', '—', '25×8 › 20×6', '—', '—']);
assert.ok(Object.values(previousSetLabels(sets, null)).every(text => text === '—'));
assert.equal(previous.notes, 'Nota histórica');
const session: LiveSession = { id: 's1', routineId: null, name: 'Atual', status: 'ACTIVE', startedAt: date, endedAt: null, exercises: [{
  id: 'ex', exerciseId: 'catalog', order: 0, exerciseNameSnapshot: 'Nome', equipmentSnapshot: 'BARBELL', primaryMuscleSnapshot: 'CHEST',
  measurementTypeSnapshot: 'WEIGHT_REPS', notes: null, sets,
}] };
let current = session;
let requests = 0;
const deferred: Array<{ resolve: (value: typeof response) => void; reject: (error: Error) => void }> = [];
const store = createLiveWorkoutStore({
  async personalRecords() { return { items: [] }; },
  async active() { return current; },
  async mutate() { return current; },
  previous() { requests++; return new Promise<typeof response>((resolve, reject) => deferred.push({ resolve, reject })); },
});
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
await store.load();
assert.equal(store.getSnapshot().loading, false); // pending history does not block hydration
assert.equal(requests, 1);
for (const change of ['weight', 'reps', 'completion', 'notes', 'segments']) await store.mutate(change, '/s1/anything', 'PATCH');
assert.equal(requests, 1);
deferred[0].resolve(response); await flush();
assert.equal(store.getSnapshot().previous.ex?.notes, 'Nota histórica');
current = { ...session, exercises: [...session.exercises, { ...session.exercises[0], id: 'ex2', order: 1 }] };
await store.mutate('add', '/s1/exercises', 'POST'); assert.equal(requests, 2);
current = { ...session, id: 's2' };
await store.load(); assert.equal(requests, 3);
deferred[1].resolve(response); await flush();
assert.deepEqual(store.getSnapshot().previous, {}); // obsolete response cannot populate the new session
const newResponse = structuredClone(response); newResponse.items[0].previous!.notes = 'Nova referência';
deferred[2].resolve(newResponse); await flush();
assert.equal(store.getSnapshot().previous.ex?.notes, 'Nova referência');
await store.load(); assert.equal(requests, 3); // repeated hydration reuses cached history
current = { ...session, id: 's3' };
await store.load(); deferred[3].reject(new Error('offline')); await flush();
assert.ok(store.getSnapshot().previousError);
assert.equal(store.getSnapshot().unavailable, false);
assert.equal(await store.mutate('edit', '/s3/sets', 'PATCH'), true);
assert.equal(requests, 4);
console.log('PASS ordinais por tipo, extras, ausência, drop completo, nota, cache, carregamento independente, erro não bloqueante e resposta obsoleta.');
