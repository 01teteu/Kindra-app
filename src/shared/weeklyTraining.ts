export const trainingWeekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type TrainingWeekday = typeof trainingWeekdays[number];
export const weekdayLabels: Record<TrainingWeekday, { short: string; full: string }> = {
  MONDAY: { short: 'SEG', full: 'Segunda-feira' }, TUESDAY: { short: 'TER', full: 'Terça-feira' },
  WEDNESDAY: { short: 'QUA', full: 'Quarta-feira' }, THURSDAY: { short: 'QUI', full: 'Quinta-feira' },
  FRIDAY: { short: 'SEX', full: 'Sexta-feira' }, SATURDAY: { short: 'SÁB', full: 'Sábado' },
  SUNDAY: { short: 'DOM', full: 'Domingo' },
};
export interface RoutineSummary { id: string; name: string; exerciseCount: number }
export interface WeeklyTrainingDay {
  id: string; dayOfWeek: TrainingWeekday; routineId: string; routine: RoutineSummary;
}
export interface WeeklyTrainingPlan {
  id: string; name: string; source: 'GENERATED' | 'CUSTOM'; isActive: boolean; days: WeeklyTrainingDay[];
}
// No persisted user timezone exists. Today follows the browser's local calendar,
// including DST; never the API server's UTC date.
export function localTrainingWeekday(date = new Date()): TrainingWeekday {
  return trainingWeekdays[(date.getDay() + 6) % 7];
}
export function trainingToday(plan: WeeklyTrainingPlan | null, date = new Date()) {
  return plan?.days.find(day => day.dayOfWeek === localTrainingWeekday(date)) ?? null;
}
