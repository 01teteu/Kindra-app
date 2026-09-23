// Presentation only. Coverage uses existing, reviewed regions of the schematic.
// Never infer anatomy from exercise names or from a missing/unknown code.
import { muscleLabels } from '../../shared/activityOptions';
export interface MuscleMapData {
  exerciseName: string;
  primaryMuscle?: string | null;
  secondaryMuscles?: readonly string[] | null;
  muscleRegion?: string | null;
}

const groups: Record<string, { label: string; regions: readonly string[] }> = {
  // Broad posterior region: does not claim a specific muscle or muscleRegion emphasis.
  BACK: { label: 'Costas', regions: ['upper-back', 'lower-back', 'trapezius'] },
  SHOULDERS: { label: 'Ombros', regions: ['front-deltoids', 'back-deltoids'] },
  CALVES: { label: 'Panturrilhas', regions: ['calves'] },
  TRAPS: { label: 'Trapézio', regions: ['trapezius'] },
  REAR_DELTOID: { label: 'Deltoide posterior', regions: ['back-deltoids'] },
  LOWER_BACK: { label: 'Região lombar', regions: ['lower-back'] },
  CHEST: { label: 'Peito', regions: ['chest'] },
  TRICEPS: { label: 'Tríceps', regions: ['triceps'] },
  FRONT_DELTOID: { label: 'Deltoide anterior', regions: ['front-deltoids'] },
  BICEPS: { label: 'Bíceps', regions: ['biceps'] },
  FOREARMS: { label: 'Antebraços', regions: ['forearm'] },
  QUADS: { label: 'Quadríceps', regions: ['quadriceps'] },
  GLUTES: { label: 'Glúteos', regions: ['gluteal'] },
  HAMSTRINGS: { label: 'Posteriores de coxa', regions: ['hamstring'] },
  CORE: { label: 'Core', regions: [] },
};

// Refinements belong to the primary group only. Never apply them to secondaries.
const refinements: Record<string, Record<string, { regions: readonly string[]; note: string }>> = {
  SHOULDERS: {
    FRONT_DELTOID: { regions: ['front-deltoids'], note: 'Porção anterior dos ombros.' },
    REAR_DELTOID: { regions: ['back-deltoids'], note: 'Porção posterior dos ombros.' },
    LATERAL_DELTOID: { regions: groups.SHOULDERS.regions, note: 'Ênfase lateral cadastrada; o mapa representa os ombros em geral, sem isolar a porção lateral.' },
    GENERAL_SHOULDER: { regions: groups.SHOULDERS.regions, note: 'Representação geral dos ombros.' },
  },
  CALVES: {
    GASTROCNEMIUS: { regions: groups.CALVES.regions, note: 'Ênfase cadastrada: gastrocnêmio. Representação geral das panturrilhas.' },
    SOLEUS: { regions: groups.CALVES.regions, note: 'Ênfase cadastrada: sóleo. Representação geral das panturrilhas, sem isolar o sóleo.' },
  },
  CORE: {
    RECTUS_ABDOMINIS: { regions: ['abs'], note: 'Reto abdominal, conforme o refinamento cadastrado.' },
    LOWER_ABS: { regions: ['abs'], note: 'Ênfase inferior cadastrada; o mapa representa a área abdominal geral, sem isolar sua parte inferior.' },
    OBLIQUES: { regions: ['obliques'], note: 'Região dos oblíquos, sem distinção entre camadas.' },
    TRANSVERSE_CORE: { regions: [], note: 'Transverso cadastrado, sem representação segura nesta geometria superficial.' },
  },
  BACK: {
    LOWER_BACK: { regions: ['lower-back'], note: 'Região lombar, sem identificar músculos individuais.' },
    UPPER_BACK: { regions: ['upper-back', 'trapezius'], note: 'Região superior das costas, representada de forma geral.' },
    LATS: { regions: groups.BACK.regions, note: 'Ênfase em dorsais cadastrada; o mapa representa costas em geral, sem isolar os dorsais.' },
    MID_BACK: { regions: groups.BACK.regions, note: 'Ênfase na região média cadastrada; o mapa representa costas em geral.' },
  },
  TRAPS: {
    UPPER_TRAPS: { regions: groups.TRAPS.regions, note: 'Ênfase superior cadastrada; representação do trapézio geral.' },
    MID_TRAPS: { regions: groups.TRAPS.regions, note: 'Ênfase média cadastrada; representação do trapézio geral.' },
    LOWER_TRAPS: { regions: groups.TRAPS.regions, note: 'Ênfase inferior cadastrada; representação do trapézio geral.' },
  },
};

// The source reuses the calves key on the anterior lower leg. Use only the
// posterior silhouette for this general group, without editing the polygons.
export const isMuscleRegionVisible = (region: string, view: 'front' | 'back') => region !== 'calves' || view === 'back';
const textOnlyLabels: Record<string, string> = {
  HIP_FLEXORS: 'Flexores do quadril', LATS: 'Dorsais', LOWER_BACK: 'Região lombar',
  MID_BACK: 'Região média das costas', REAR_DELTOID: 'Deltoide posterior',
  ROTATOR_CUFF: 'Manguito rotador', UPPER_CHEST: 'Peitoral superior',
};

export function resolveMuscleMap(data: MuscleMapData) {
  const resolve = (code: string) => ({
    code, label: groups[code]?.label ?? textOnlyLabels[code] ?? muscleLabels[code] ?? code,
    regions: groups[code]?.regions ?? [],
    note: code === 'CORE' ? 'Grupo amplo, identificado apenas em texto.'
      : groups[code] ? null : 'Sem correspondência visual neste protótipo.',
  });
  const basePrimary = data.primaryMuscle ? resolve(data.primaryMuscle) : null;
  const refinement = data.primaryMuscle && data.muscleRegion
    ? refinements[data.primaryMuscle]?.[data.muscleRegion] : undefined;
  const primary = basePrimary && refinement ? { ...basePrimary, ...refinement } : basePrimary;
  const secondary = Array.isArray(data.secondaryMuscles)
    ? [...new Set(data.secondaryMuscles)].map(resolve) : null;
  const primaryRegions = new Set(primary?.regions ?? []);
  const secondaryRegions = new Set(secondary?.flatMap(item => [...item.regions]) ?? []);
  const emphasis = data.primaryMuscle === 'CHEST' && data.muscleRegion === 'MID_CHEST'
    ? 'Região média do peitoral' : null;
  const description = `Principal: ${primary?.label ?? 'não informado'}. Secundários: ${secondary === null
    ? 'não informados' : secondary.length ? secondary.map(item => item.label).join(', ') : 'nenhum cadastrado'}.${primary?.note ? ` ${primary.note}` : ''}`;
  return { primary, secondary, primaryRegions, secondaryRegions, emphasis,
    canShowCompact: primaryRegions.size > 0, description };
}
