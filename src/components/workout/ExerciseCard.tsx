import { Check, Plus } from 'lucide-react';
import { muscleLabels, equipmentLabels, type CatalogExercise } from '../../shared/activityOptions';
import { ExerciseThumbnail } from './ExerciseThumbnail';

export function ExerciseCard({ exercise, selected, onToggle }: {
  exercise: CatalogExercise; selected: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" className={`kindra-card exercise-card${selected ? ' is-selected' : ''}`}
      aria-pressed={selected} aria-label={`${exercise.name}, ${muscleLabels[exercise.primaryMuscle] ?? exercise.primaryMuscle}, ${equipmentLabels[exercise.equipment] ?? exercise.equipment}`}
      onClick={onToggle}>
      <ExerciseThumbnail exercise={exercise} />
      <span className="exercise-card-body">
        <span className="text-xs text-kindra-500">{muscleLabels[exercise.primaryMuscle] ?? exercise.primaryMuscle}</span>
        <span className="exercise-card-name">{exercise.name}</span>
        <span className="exercise-card-footer">
          <span className="text-xs text-kindra-500">{equipmentLabels[exercise.equipment] ?? exercise.equipment}</span>
          <span className="exercise-selection" aria-hidden="true">
            {selected ? <Check size={16} /> : <Plus size={16} />}
          </span>
        </span>
      </span>
    </button>
  );
}
