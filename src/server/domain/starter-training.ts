import { starterEquipment, type StarterTrainingInput } from '../../shared/starterTraining.js';
import type { TrainingWeekday } from '../../shared/weeklyTraining.js';
import { muscleLabels } from '../../shared/activityOptions.js';

export interface StarterExercise {
  id: string; slug: string; origin: 'GLOBAL' | 'CUSTOM'; primaryMuscle: string;
  movementPattern: string | null; equipment: string; laterality: string | null;
  measurementType: string;
}
export class StarterTrainingError extends Error {}
type Slot = { muscle: string; patterns: string[] };
const slot = (muscle: string, ...patterns: string[]): Slot => ({ muscle, patterns });
const quads = slot('QUADS', 'LEG_PRESS', 'SQUAT', 'KNEE_DOMINANT_SQUAT');
const posterior = slot('HAMSTRINGS', 'KNEE_FLEXION', 'HIP_HINGE');
const chest = slot('CHEST', 'HORIZONTAL_PRESS', 'INCLINE_PRESS');
const back = slot('BACK', 'HORIZONTAL_PULL', 'VERTICAL_PULL');
const shoulders = slot('SHOULDERS', 'OVERHEAD_PRESS', 'LATERAL_RAISE');
const core = slot('CORE', 'TRUNK_FLEXION', 'ANTI_ROTATION');
const variant = (value: Slot): Slot => ({ ...value, patterns: [...value.patterns].reverse() });
const fullA = [quads, chest, back, posterior, shoulders, core];
const fullB = [variant(quads), variant(chest), variant(back), variant(posterior), variant(shoulders), core];
const upperA = [chest, slot('BACK', 'HORIZONTAL_PULL'), shoulders, slot('BACK', 'VERTICAL_PULL'),
  slot('BICEPS', 'ELBOW_FLEXION'), slot('TRICEPS', 'ELBOW_EXTENSION', 'OVERHEAD_ELBOW_EXTENSION')];
const lowerA = [quads, posterior, slot('GLUTES', 'HIP_THRUST', 'HIP_EXTENSION'), slot('CALVES', 'PLANTAR_FLEXION'), core];
const schedules: Record<StarterTrainingInput['trainingDaysPerWeek'], { dayOfWeek: TrainingWeekday; routineIndex: number }[]> = {
  2: [{ dayOfWeek: 'MONDAY', routineIndex: 0 }, { dayOfWeek: 'THURSDAY', routineIndex: 1 }],
  3: [{ dayOfWeek: 'MONDAY', routineIndex: 0 }, { dayOfWeek: 'WEDNESDAY', routineIndex: 1 }, { dayOfWeek: 'FRIDAY', routineIndex: 0 }],
  4: [{ dayOfWeek: 'MONDAY', routineIndex: 0 }, { dayOfWeek: 'TUESDAY', routineIndex: 1 },
    { dayOfWeek: 'THURSDAY', routineIndex: 2 }, { dayOfWeek: 'FRIDAY', routineIndex: 3 }],
};
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Caller supplies only the authenticated user's active, accessible catalog.
// No I/O, random numbers, date, input mutation or persisted generator state.
export function generateStarterTrainingPlan(input: StarterTrainingInput, catalog: readonly StarterExercise[]) {
  const templates: { name: string; slots: Slot[] }[] = input.trainingDaysPerWeek === 4 ? [
    { name: 'Upper A', slots: upperA }, { name: 'Lower A', slots: lowerA },
    { name: 'Upper B', slots: upperA.map(variant) }, { name: 'Lower B', slots: lowerA.map(variant) },
  ] : [{ name: 'Full Body A', slots: fullA }, { name: 'Full Body B', slots: fullB }];
  const eligible = catalog.filter(ex => ex.measurementType === 'WEIGHT_REPS' && input.equipment.some(value => value === ex.equipment));
  const routines = templates.map(template => {
    const used = new Set<string>();
    const exercises = template.slots.map((block, order) => {
      const candidates = eligible.filter(ex => !used.has(ex.id) && ex.primaryMuscle === block.muscle &&
        ex.movementPattern !== null && block.patterns.includes(ex.movementPattern));
      const rankLaterality = (value: string | null) => {
        const index = ['BILATERAL', 'UNILATERAL', 'ALTERNATING'].indexOf(value ?? '');
        return index < 0 ? 3 : index;
      };
      candidates.sort((a, b) => block.patterns.indexOf(a.movementPattern!) - block.patterns.indexOf(b.movementPattern!) ||
        starterEquipment.indexOf(a.equipment as typeof starterEquipment[number]) - starterEquipment.indexOf(b.equipment as typeof starterEquipment[number]) ||
        rankLaterality(a.laterality) - rankLaterality(b.laterality) || compareText(a.slug, b.slug) ||
        compareText(a.origin, b.origin) || compareText(a.id, b.id));
      const exercise = candidates[0];
      if (!exercise) throw new StarterTrainingError(`Catálogo insuficiente para ${template.name}: faltam exercícios de ${muscleLabels[block.muscle]} compatíveis com os equipamentos informados. Você pode montar sua semana manualmente.`);
      used.add(exercise.id);
      return { exerciseId: exercise.id, order, notes: null, restTime: null };
    });
    return { name: template.name, exercises };
  });
  return { name: `Base inicial · ${input.trainingDaysPerWeek} dias`, routines, days: schedules[input.trainingDaysPerWeek].map(day => ({ ...day })) };
}
