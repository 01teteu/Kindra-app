import assert from 'node:assert/strict';
import { createRoutineBuilderStore, routinePayload } from '../../components/workout/routineBuilderState.js';
import type { LiveCatalogExercise } from '../../components/workout/live/model.js';
const a: LiveCatalogExercise = { id: 'a', name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL', origin: 'GLOBAL', measurementType: 'WEIGHT_REPS' };
const b: LiveCatalogExercise = { ...a, id: 'b', name: 'Inclinado' };
const detail = (name: string, exercises: any[]) => ({ id: 'routine', name, exercises: exercises.map((e, i) => ({
  id: `item-${i}`, exerciseId: e.exerciseId, order: e.order, notes: e.notes, restTime: e.restTime,
  exercise: { ...(e.exerciseId === 'a' ? a : b), isActive: true },
})) });
const deferred = () => { let resolve!: (v: any) => void; let reject!: (e: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let calls = 0; let fail = true; let response = deferred(); let captured: any;
const store = createRoutineBuilderStore(undefined, async (path, options) => {
  calls++; assert.equal(path, '/workouts/routines'); assert.equal(options?.method, 'POST'); captured = options?.data;
  if (fail) throw Error('Offline'); return response.promise;
});
assert.equal(store.getSnapshot().ready, true); assert.equal(store.getSnapshot().dirty, false);
store.setName(' Treino '); store.add([a, b, a]);
assert.equal(store.getSnapshot().items.length, 3); assert.equal(new Set(store.getSnapshot().items.map(i => i.key)).size, 3);
const first = store.getSnapshot().items[0].key;
store.edit(first, { notes: ' Controle ', restTime: '90' }); store.move(first, 1);
assert.deepEqual(store.getSnapshot().items.map(i => i.exercise.id), ['b', 'a', 'a']);
store.remove(store.getSnapshot().items[2].key);
assert.deepEqual(routinePayload(store.getSnapshot().name, store.getSnapshot().items).exercises, [
  { exerciseId: 'b', order: 0, notes: null, restTime: null }, { exerciseId: 'a', order: 1, notes: 'Controle', restTime: 90 },
]);
const before = store.getSnapshot().items;
assert.equal(await store.save(), null); assert.equal(store.getSnapshot().items, before); assert.equal(store.getSnapshot().name, ' Treino ');
assert.equal(store.getSnapshot().dirty, true); assert.equal(store.getSnapshot().error, 'Offline');
fail = false; const saving = store.save();
assert.equal(store.getSnapshot().pending, true); assert.equal(await store.save(), null); assert.equal(calls, 2);
store.setName('Ignored'); store.remove(first); assert.equal(store.getSnapshot().items, before);
response.resolve(detail(captured.name, captured.exercises)); assert.ok(await saving);
assert.equal(store.getSnapshot().dirty, false); assert.equal(store.getSnapshot().name, 'Treino');
for (const restTime of ['-1', '0.5', 'a', '2147483648']) assert.throws(() => routinePayload('A', [{ key: 'key', exercise: a, notes: '', restTime }]));
assert.equal(routinePayload('A', [{ key: 'key', exercise: a, notes: '', restTime: '0' }]).exercises[0].restTime, 0);
assert.throws(() => routinePayload(' ', []));

let server = detail('Existing', [{ exerciseId: 'a', order: 4, notes: 'Nota', restTime: 120 }, { exerciseId: 'b', order: 1, notes: null, restTime: null }]);
let handler = async (_path: string, _options?: any): Promise<unknown> => server;
const edit = createRoutineBuilderStore('routine', (path, options) => handler(path, options));
await edit.load(); assert.deepEqual(edit.getSnapshot().items.map(i => i.exercise.id), ['b', 'a']);
edit.setName('Edited');
handler = async (path, options) => { assert.equal(path, '/workouts/routines/routine'); assert.equal(options.method, 'PATCH'); return detail(options.data.name, options.data.exercises); };
await edit.save(); assert.equal(edit.getSnapshot().dirty, false);
const old = deferred(); const recent = deferred(); let loads = 0;
handler = async () => ++loads === 1 ? old.promise : recent.promise;
const loadA = edit.load(); const loadB = edit.load();
recent.resolve({ ...server, name: 'Newest' }); await loadB; old.resolve({ ...server, name: 'Old' }); await loadA;
assert.equal(edit.getSnapshot().name, 'Newest');
handler = async () => { throw Error('Load failed'); }; await edit.load(); assert.equal(edit.getSnapshot().name, 'Newest');
edit.setName('Unsaved'); await edit.load(); assert.equal(edit.getSnapshot().name, 'Unsaved');
handler = async (path, options) => { assert.equal(options.method, 'DELETE'); assert.equal(path, '/workouts/routines/routine'); throw Error('Cannot delete'); };
assert.equal(await edit.removeRoutine(), false); assert.equal(edit.getSnapshot().name, 'Unsaved');
handler = async () => null; assert.equal(await edit.removeRoutine(), true); assert.equal(edit.getSnapshot().dirty, false);
console.log('PASS Builder state: criar/editar/reorder/remover/repetições, notas/rest, payload ordenado, erros preservam rascunho, duplo submit, loads obsoletos e delete.');
