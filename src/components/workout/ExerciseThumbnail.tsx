import { useEffect, useId, useRef, useState } from 'react';
import { Activity, BicepsFlexed, Dumbbell, Footprints, MoveHorizontal, MoveVertical, type LucideIcon } from 'lucide-react';
import { muscleLabels, type CatalogExercise } from '../../shared/activityOptions';
import { MuscleMap } from './MuscleMap';
import { resolveMuscleMap } from './muscle-map-mapping';

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
  const container = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const [mapSize, setMapSize] = useState<'none' | 'focused' | 'full'>('none');
  const data = { exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles, muscleRegion: exercise.muscleRegion };
  const map = resolveMuscleMap(data);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // Small thumbnails show one focused view, rather than two unreadable full bodies.
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setMapSize(width >= 90 && height >= 112 ? 'full' : width >= 46 && height >= 46 ? 'focused' : 'none');
    });
    observer.observe(element);
    // ExerciseCard has an explicit accessible name; associate the muscle description
    // without changing that name or its selection handler. Preserve other descriptions.
    const button = element.closest('button');
    if (button) button.setAttribute('aria-describedby', [...new Set([
      ...(button.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []), descriptionId,
    ])].join(' '));
    return () => {
      observer.disconnect();
      if (button) {
        const remaining = button.getAttribute('aria-describedby')?.split(/\s+/).filter(id => id && id !== descriptionId);
        if (remaining?.length) button.setAttribute('aria-describedby', remaining.join(' '));
        else button.removeAttribute('aria-describedby');
      }
    };
  }, [descriptionId]);
  return (
    <div className="exercise-thumbnail" ref={container}>
      <span className="sr-only" id={descriptionId}>{map.description}</span>
      {exercise.thumbnailUrl && exercise.thumbnailUrl !== failedSrc ? (
        <img src={exercise.thumbnailUrl} alt="" loading="lazy" decoding="async"
          className="h-full w-full object-cover" onError={() => setFailedSrc(exercise.thumbnailUrl!)} />
      ) : map.canShowCompact && mapSize !== 'none' ? <MuscleMap {...data} compact focused={mapSize === 'focused'} /> : (
        <div className="exercise-placeholder" aria-hidden="true">
          <span className="exercise-placeholder-orbit"><MuscleVisual muscle={exercise.primaryMuscle} /></span>
          <span className="eyebrow">{muscleLabels[exercise.primaryMuscle] ?? exercise.primaryMuscle}</span>
        </div>
      )}
    </div>
  );
}
