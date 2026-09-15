// Equipment vocabulary is the existing catalog vocabulary; this order is a
// generator tie-break rule, not a difficulty or safety classification.
export const starterEquipment = ['MACHINE', 'PLATE_LOADED', 'CABLE', 'SMITH_MACHINE', 'DUMBBELL',
  'BARBELL', 'EZ_BAR', 'TRAP_BAR', 'KETTLEBELL', 'BAND', 'LANDMINE', 'PLATE', 'BODYWEIGHT', 'RINGS', 'OTHER'] as const;
export interface StarterTrainingInput {
  trainingDaysPerWeek: 2 | 3 | 4;
  equipment: (typeof starterEquipment[number])[];
}
