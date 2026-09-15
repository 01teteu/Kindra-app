import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateStarterTrainingPlan, StarterTrainingError, type StarterExercise } from './starter-training.js';
import { starterEquipment, type StarterTrainingInput } from '../../shared/starterTraining.js';
import { generatePlanSchema } from '../schemas/weekly-training.schema.js';

const catalog: StarterExercise[] = JSON.parse(readFileSync('prisma/seed-data/exercises.json', 'utf8'))
  .filter((ex: { isActive: boolean }) => ex.isActive).map((ex: StarterExercise) => ({ ...ex, id: ex.slug, origin: 'GLOBAL' }));
const original = structuredClone(catalog);
const expectedDays = { 2: ['MONDAY', 'THURSDAY'], 3: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], 4: ['MONDAY', 'TUESDAY', 'THURSDAY', 'FRIDAY'] };
for (const frequency of [2, 3, 4] as const) {
  const input: StarterTrainingInput = { trainingDaysPerWeek: frequency, equipment: ['MACHINE', 'CABLE', 'DUMBBELL'] };
  const result = generateStarterTrainingPlan(input, catalog);
  assert.deepEqual(generateStarterTrainingPlan({ ...input, equipment: [...input.equipment].reverse() }, [...catalog].reverse()), result);
  assert.deepEqual(result.days.map(day => day.dayOfWeek), expectedDays[frequency]);
  assert.equal(result.routines.length, frequency === 4 ? 4 : 2);
  if (frequency === 3) assert.deepEqual(result.days.map(day => day.routineIndex), [0, 1, 0]);
  const expectedMuscles = frequency === 4
    ? [['CHEST', 'BACK', 'SHOULDERS', 'BACK', 'BICEPS', 'TRICEPS'], ['QUADS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'CORE']]
    : [['QUADS', 'CHEST', 'BACK', 'HAMSTRINGS', 'SHOULDERS', 'CORE']];
  result.routines.forEach((routine, index) => {
    assert.deepEqual(routine.exercises.map(ex => catalog.find(row => row.id === ex.exerciseId)!.primaryMuscle), expectedMuscles[index % expectedMuscles.length]);
    assert.deepEqual(routine.exercises.map(ex => ex.order), routine.exercises.map((_, order) => order));
    assert.equal(new Set(routine.exercises.map(ex => ex.exerciseId)).size, routine.exercises.length);
    for (const planned of routine.exercises) {
      const exercise = catalog.find(ex => ex.id === planned.exerciseId)!;
      assert.equal(exercise.measurementType, 'WEIGHT_REPS');
      assert.ok(input.equipment.some(value => value === exercise.equipment));
      assert.equal(planned.notes, null); assert.equal(planned.restTime, null);
    }
  });
  assert.throws(() => generateStarterTrainingPlan(input, catalog.filter(ex => ex.primaryMuscle !== 'QUADS')), StarterTrainingError);
  assert.throws(() => generateStarterTrainingPlan(input, []), /Catálogo insuficiente/);
}
assert.deepEqual(catalog, original);
const input: StarterTrainingInput = { trainingDaysPerWeek: 2, equipment: ['MACHINE', 'DUMBBELL'] };
const ranked = (id: string, changes: Partial<StarterExercise> = {}): StarterExercise => ({ id, slug: id, origin: 'GLOBAL',
  primaryMuscle: 'QUADS', movementPattern: 'LEG_PRESS', equipment: 'MACHINE', laterality: 'BILATERAL', measurementType: 'WEIGHT_REPS', ...changes });
const candidates = [ranked('z'), ranked('a'), ranked('0-time', { measurementType: 'TIME' }),
  ranked('0-unilateral', { laterality: 'UNILATERAL' }), ranked('0-unknown', { movementPattern: null }),
  ranked('0-halter', { equipment: 'DUMBBELL' }), ranked('0-other', { equipment: 'OTHER' }),
  ranked('0-squat', { movementPattern: 'SQUAT' }), ranked('0-wrong-muscle', { primaryMuscle: 'CORE' })];
const result = generateStarterTrainingPlan(input, [...catalog.filter(ex => ex.primaryMuscle !== 'QUADS'), ...candidates]);
assert.equal(result.routines[0].exercises[0].exerciseId, 'a');
assert.equal(result.routines[1].exercises[0].exerciseId, '0-squat');
const ties = generateStarterTrainingPlan(input, [...catalog.filter(ex => ex.primaryMuscle !== 'QUADS'),
  ranked('z', { slug: 'tie' }), ranked('b', { slug: 'tie', origin: 'CUSTOM' }), ranked('a', { slug: 'tie', origin: 'CUSTOM' })]);
assert.equal(ties.routines[0].exercises[0].exerciseId, 'a');
for (const payload of [{}, { ...input, trainingDaysPerWeek: 5 }, { ...input, trainingDaysPerWeek: '3' },
  { ...input, equipment: [] }, { ...input, equipment: ['MACHINE', 'MACHINE'] }, { ...input, equipment: ['UNKNOWN'] },
  { ...input, userId: 'foreign' }, { ...input, source: 'CUSTOM' }]) assert.equal(generatePlanSchema.safeParse(payload).success, false);
assert.ok(generatePlanSchema.safeParse({ trainingDaysPerWeek: 4, equipment: [...starterEquipment] }).success);
console.log('PASS domínio: catálogo real, frequências, weekdays, ordem, filtros, desempate, determinismo, imutabilidade e validação.');
