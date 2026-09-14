import { useState } from 'react';
import { Activity, BicepsFlexed, Dumbbell, Footprints, MoveHorizontal, MoveVertical, type LucideIcon } from 'lucide-react';
import { muscleLabels, type CatalogExercise } from '../../shared/activityOptions';

// Future Kindra-owned anatomical assets belong only in this map, keyed by
// primaryMuscle (e.g. CHEST). An absent asset intentionally uses the pictogram.
const muscleArtwork: Partial<Record<string, string>> = {};
const muscleIcons: Record<string, LucideIcon> = {
  CHEST: MoveHorizontal, BACK: MoveVertical, SHOULDERS: Dumbbell,
  BICEPS: BicepsFlexed, TRICEPS: BicepsFlexed, FOREARMS: BicepsFlexed, TRAPS: MoveVertical,
  QUADS: Footprints, HAMSTRINGS: Footprints, GLUTES: Footprints,
  ADDUCTORS: Footprints, CALVES: Footprints, CORE: Activity,
};

function Pictogram({ muscle }: { muscle: string }) {
  const Icon = muscleIcons[muscle] ?? Dumbbell;
  return <Icon className="h-full w-full" strokeWidth={1.2} aria-hidden="true" />;
}

function MuscleArtwork({ muscle, src }: { muscle: string; src: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return failedSrc === src ? <Pictogram muscle={muscle} /> :
    <img src={src} alt="" className="h-full w-full object-contain" onError={() => setFailedSrc(src)} />;
}

// Also used in the muscle chooser; replacing artwork updates both surfaces.
export function MuscleVisual({ muscle }: { muscle: string }) {
  const src = muscleArtwork[muscle];
  return src ? <MuscleArtwork muscle={muscle} src={src} /> : <Pictogram muscle={muscle} />;
}

export function ExerciseThumbnail({ exercise }: { exercise: CatalogExercise }) {
  // Remember the failed URL, so a replacement URL still gets a load attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="exercise-thumbnail" aria-hidden="true">
      {exercise.thumbnailUrl && exercise.thumbnailUrl !== failedSrc ? (
        <img src={exercise.thumbnailUrl} alt="" loading="lazy" decoding="async"
          className="h-full w-full object-cover" onError={() => setFailedSrc(exercise.thumbnailUrl!)} />
      ) : (
        <div className="exercise-placeholder">
          <span className="exercise-placeholder-orbit"><MuscleVisual muscle={exercise.primaryMuscle} /></span>
          <span className="eyebrow">{muscleLabels[exercise.primaryMuscle] ?? exercise.primaryMuscle}</span>
        </div>
      )}
    </div>
  );
}
