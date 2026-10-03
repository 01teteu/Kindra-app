import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateConsumedTotals, calculateWaterTotal } from './nutritionTotals';
import type { Meal, WaterIntakeLog } from './nutrition';

test('sums consumed macros by gram amount using the Nutrition page formula', () => {
  const meals = [{ entries: [
    { amountGrams: 150, food: { kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 } },
    { amountGrams: 50, food: { kcal: 200, proteinG: 8, carbsG: 12, fatG: 10 } },
  ] }, { entries: [] }] as Meal[];
  assert.deepEqual(calculateConsumedTotals(meals), { kcal: 250, proteinG: 19, carbsG: 36, fatG: 12.5 });
  assert.deepEqual(calculateConsumedTotals([]), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});

test('sums only the provided water logs and preserves an empty-day zero', () => {
  const logs = [{ amountMl: 250 }, { amountMl: 500 }] as WaterIntakeLog[];
  assert.equal(calculateWaterTotal(logs), 750);
  assert.equal(calculateWaterTotal([]), 0);
});
