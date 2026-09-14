// Presentation labels only; the global catalogs live exclusively in seed-data JSONs.
export const muscleLabels: Record<string, string> = {
  CHEST: 'Peito', BACK: 'Costas', SHOULDERS: 'Ombros', BICEPS: 'Bíceps', TRICEPS: 'Tríceps',
  QUADS: 'Quadríceps', HAMSTRINGS: 'Posteriores de coxa', GLUTES: 'Glúteos', ADDUCTORS: 'Adutores',
  CALVES: 'Panturrilha', CORE: 'Abdômen', FOREARMS: 'Antebraços', TRAPS: 'Trapézio',
};
export const equipmentLabels: Record<string, string> = {
  BAND: 'Elástico', BARBELL: 'Barra', BODYWEIGHT: 'Peso corporal', CABLE: 'Cabo', DUMBBELL: 'Halter',
  EZ_BAR: 'Barra EZ', KETTLEBELL: 'Kettlebell', LANDMINE: 'Landmine', MACHINE: 'Máquina', OTHER: 'Outro',
  PLATE: 'Anilha', PLATE_LOADED: 'Máquina com anilhas', RINGS: 'Argolas', SMITH_MACHINE: 'Smith', TRAP_BAR: 'Barra hexagonal',
};
export interface CatalogExercise {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  origin: 'GLOBAL' | 'CUSTOM';
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
}
