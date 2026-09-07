export const GOAL_OPTIONS = ['Emagrecimento', 'Hipertrofia', 'Manutencao'] as const;
export const ACTIVITY_LEVEL_OPTIONS = ['Sedentario', 'Leve', 'Moderado', 'Intenso'] as const;
export const BIOLOGICAL_SEX_OPTIONS = ['MALE', 'FEMALE'] as const;

export type GoalOption = typeof GOAL_OPTIONS[number];
export type ActivityLevelOption = typeof ACTIVITY_LEVEL_OPTIONS[number];
export type BiologicalSexOption = typeof BIOLOGICAL_SEX_OPTIONS[number];
