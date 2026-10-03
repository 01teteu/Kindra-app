import type { Meal, WaterIntakeLog } from './nutrition';

export interface ConsumedTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function calculateConsumedTotals(meals: Meal[]): ConsumedTotals {
  return meals.reduce((acc, meal) => {
    meal.entries.forEach(entry => {
      const multiplier = entry.amountGrams / 100;
      acc.kcal += entry.food.kcal * multiplier;
      acc.proteinG += entry.food.proteinG * multiplier;
      acc.carbsG += entry.food.carbsG * multiplier;
      acc.fatG += entry.food.fatG * multiplier;
    });
    return acc;
  }, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

export function calculateWaterTotal(logs: WaterIntakeLog[]): number {
  return logs.reduce((sum, log) => sum + log.amountMl, 0);
}
