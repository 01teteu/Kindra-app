import { type CatalogExercise } from '../../shared/activityOptions';

// Presentation groups retain the existing quick-filter semantics.
export const quickMuscleGroups = [
  { label: 'Peito', codes: ['CHEST'] }, { label: 'Costas', codes: ['BACK', 'TRAPS'] },
  { label: 'Pernas', codes: ['QUADS', 'HAMSTRINGS', 'GLUTES', 'ADDUCTORS'] },
  { label: 'Ombros', codes: ['SHOULDERS'] }, { label: 'Bíceps', codes: ['BICEPS', 'FOREARMS'] },
  { label: 'Tríceps', codes: ['TRICEPS'] }, { label: 'Panturrilha', codes: ['CALVES'] },
  { label: 'Abdômen', codes: ['CORE'] },
];

export const muscleSections = [
  { label: 'Parte superior', codes: ['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS', 'TRAPS'] },
  { label: 'Parte inferior', codes: ['QUADS', 'HAMSTRINGS', 'GLUTES', 'ADDUCTORS', 'CALVES'] },
  { label: 'Centro do corpo', codes: ['CORE'] },
];

export interface ExerciseFilters { muscles: string[]; equipment: string }
export const emptyExerciseFilters: ExerciseFilters = { muscles: [], equipment: '' };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();

export function filterExercises(exercises: CatalogExercise[], query: string, filters: ExerciseFilters) {
  const search = normalize(query);
  return exercises.filter(exercise =>
    (!filters.muscles.length || filters.muscles.includes(exercise.primaryMuscle)) &&
    (!filters.equipment || filters.equipment === exercise.equipment) &&
    normalize(exercise.name).includes(search),
  );
}
