import assert from 'node:assert/strict';
import { createWeeklyTrainingStore } from '../../components/workout/weeklyTrainingState.js';
import type { WeeklyTrainingPlan } from '../../shared/weeklyTraining.js';
const input = { trainingDaysPerWeek: 3 as const, equipment: ['MACHINE' as const] };
const routine = { id: 'routine', name: 'Full Body A', exerciseCount: 6 };
const generated: WeeklyTrainingPlan = { id: 'generated', name: 'Base inicial', source: 'GENERATED', isActive: true,
  days: ['MONDAY', 'FRIDAY'].map((day, index) => ({ id: String(index), dayOfWeek: day as 'MONDAY' | 'FRIDAY', routineId: routine.id, routine })) };
let resolve!: (value: WeeklyTrainingPlan) => void;
let reject!: (reason: unknown) => void;
let writes = 0;
const store = createWeeklyTrainingStore(async (path, options) => {
  if (options?.method === 'POST') {
    writes++; assert.equal(path, '/workouts/plans/generate'); assert.deepEqual(options.data, input);
    return new Promise<WeeklyTrainingPlan>((yes, no) => { resolve = yes; reject = no; });
  }
  return [];
});
await store.load();
assert.equal(store.getSnapshot().loaded, true); assert.deepEqual(store.getSnapshot().plans, []);
let saving = store.generate(input);
assert.equal(store.getSnapshot().pending, true);
assert.equal(await store.generate(input), false); assert.equal(writes, 1);
reject(new Error('Catálogo insuficiente'));
assert.equal(await saving, false); assert.deepEqual(store.getSnapshot().plans, []);
assert.equal(store.getSnapshot().error, 'Catálogo insuficiente'); assert.equal(store.getSnapshot().pending, false);
saving = store.generate(input); resolve(generated);
assert.equal(await saving, true); assert.equal(store.getSnapshot().selectedId, generated.id);
assert.deepEqual(store.getSnapshot().routines, [routine]); assert.equal(store.getSnapshot().error, '');
saving = store.generate(input); resolve({ ...generated, id: 'second', isActive: false });
assert.equal(await saving, true);
assert.equal(store.getSnapshot().plans.find(plan => plan.id === generated.id)?.isActive, true);
assert.equal(store.getSnapshot().selectedId, 'second');
console.log('PASS estado: vazio, contrato mínimo, loading, prevenção de clique duplo, erro, seleção e rotinas após sucesso, proteção do ativo.');
