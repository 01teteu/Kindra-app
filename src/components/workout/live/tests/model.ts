import assert from 'node:assert/strict';
import { sessionSchema, summary, parseMetric, elapsedSeconds, type LiveSession } from '../model';
import { createLiveWorkoutStore } from '../state';
import { LiveApiError, safeError } from '../api';

const date = '2026-09-13T12:00:00.000Z';
const sample: LiveSession = sessionSchema.parse({
  id: 'session', routineId: null, name: 'Teste', status: 'ACTIVE', startedAt: date, endedAt: null,
  exercises: [{ id: 'exercise', exerciseId: 'catalog', order: 4, exerciseNameSnapshot: 'Supino', primaryMuscleSnapshot: 'CHEST',
    equipmentSnapshot: 'BARBELL', measurementTypeSnapshot: 'WEIGHT_REPS', notes: 'Banco 3', sets: [
      { id: 'working', workoutExerciseId: 'exercise', setNumber: 2, type: 'WORKING', weight: 32, reps: 10, restTime: 90, completedAt: date, segments: [] },
      { id: 'warmup', workoutExerciseId: 'exercise', setNumber: 3, type: 'WARMUP', weight: 20, reps: 12, restTime: 90, completedAt: date, segments: [] },
      { id: 'drop', workoutExerciseId: 'exercise', setNumber: 5, type: 'DROP_SET', weight: null, reps: null, restTime: 90, completedAt: date,
        segments: [{ id: 'a', workoutSetId: 'drop', order: 0, weight: 34, reps: 8, completedAt: date }, { id: 'b', workoutSetId: 'drop', order: 2, weight: 28, reps: 6, completedAt: date }] },
    ] }],
});
assert.deepEqual(summary(sample.exercises), { volume: 760, sets: 2, warmups: 1 });
assert.equal(elapsedSeconds(sample, Date.parse(date) + 65000), 65);
assert.equal(elapsedSeconds({ ...sample, endedAt: new Date(Date.parse(date) + 30000).toISOString() }, Date.parse(date) + 65000), 30);
for (const value of ['', '-1', 'NaN', 'Infinity', '1e3', 'abc']) assert.equal(parseMetric(value), null);
assert.equal(parseMetric('32,5'), 32.5);
assert.equal(parseMetric('0'), 0);
assert.equal(parseMetric('3.5', true), null);
assert.equal(parseMetric('2147483648', true), null);
assert.equal('previous' in sample.exercises[0].sets[0], false);
assert.equal('previousNote' in sample.exercises[0], false);
console.log('PASS contrato, ordem com lacunas, métricas, volume visual existente e timer do servidor.');

let server: LiveSession | null = null;
let mode = 200;
let gets = 0;
const writes: string[] = [];
let release: (() => void) | undefined;
let gate: Promise<void> | undefined;
const api = {
  async personalRecords() { return { items: [] }; },
  async previous() { return { items: [] }; },
  async active() { gets++; if (mode === 503) throw new LiveApiError(503, 'Sem conexão'); return server; },
  async mutate(path: string) {
    writes.push(path);
    if (gate) await gate;
    if (mode !== 200) throw new LiveApiError(mode, 'Falha esperada');
    if (path === '') server = structuredClone(sample);
    if (path.endsWith('finish')) server = { ...sample, status: 'COMPLETED', endedAt: date };
    return server!;
  },
};
const store = createLiveWorkoutStore(api);
await store.load();
assert.equal(store.getSnapshot().session, null);
assert.equal(await store.mutate('start', '', 'POST', {}), true);
assert.deepEqual(store.getSnapshot().session, sample);
const refreshed = createLiveWorkoutStore(api);
await refreshed.load();
assert.deepEqual(refreshed.getSnapshot().session, sample);
store.dirty('working:weight', true);
assert.equal(await store.mutate('working', '/session/completion', 'PATCH', {}, 'working'), false);
assert.equal(writes.length, 1);
store.dirty('working:weight', false);

// A completion scheduled after a save executes only when that save has finished.
gate = new Promise<void>(resolve => { release = resolve; });
const saving = store.mutate('working:weight', '/session/weight', 'PATCH', { weight: 35 });
const completing = store.mutate('working', '/session/completion', 'PATCH', { completed: true }, 'working');
await Promise.resolve();
assert.equal(writes.at(-1), '/session/weight');
assert.equal(writes.includes('/session/completion'), false);
release!(); gate = undefined;
assert.equal(await saving, true); assert.equal(await completing, true);

for (const status of [404, 409, 0]) {
  mode = status;
  server = { ...sample, name: `Servidor ${status}` };
  const before = gets;
  const mutation = store.mutate('working', '/session/weight', 'PATCH', {});
  const unsafeQueued = store.mutate('end', '/session/finish', 'POST', undefined, '');
  assert.equal(await mutation, false);
  assert.equal(await unsafeQueued, false);
  assert.equal(gets, before + 1);
  assert.equal(store.getSnapshot().session?.name, server.name);
  assert.equal(store.getSnapshot().pending.length, 0);
}
mode = 400;
const before = gets;
store.dirty('working:weight', true);
assert.equal(await store.mutate('working', '/session/weight', 'PATCH', {}), false);
assert.equal(gets, before);
assert.deepEqual(store.getSnapshot().dirty, ['working:weight']);
mode = 503;
await store.mutate('working', '/session/weight', 'PATCH', {});
assert.equal(store.getSnapshot().unavailable, true);
const count = writes.length;
await store.mutate('working', '/session/weight', 'PATCH', {});
assert.equal(writes.length, count);
mode = 200; server = null;
await store.load();
assert.equal(store.getSnapshot().session, null);
assert.deepEqual(store.getSnapshot().dirty, []);
assert.equal(safeError(new Error('SQL secret')).message.includes('SQL'), false);
mode = 401;
await store.mutate('start', '', 'POST', {});
assert.equal(store.getSnapshot().authExpired, true);
console.log('PASS GET/refresh, fila de gravações, bloqueio de conclusão com edição pendente, 400/401/404/409/rede, recuperação e cancelamento de ações obsoletas.');
