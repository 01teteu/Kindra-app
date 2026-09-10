import { apiFetch } from './api';

export interface NutritionGoal {
  id: string;
  userId: string;
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetWaterMl: number;
  activeFrom: string;
  createdAt: string;
  updatedAt: string;
}

export interface WaterIntakeLog {
  id: string;
  userId: string;
  amountMl: number;
  loggedAt: string;
}

export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  loggedAt: string;
}

export interface NutritionHistory {
  id: string;
  userId: string;
  date: string;
  waterIngestedMl: number;
  consumedKcal: number;
  consumedProteinG: number;
  consumedCarbsG: number;
  consumedFatG: number;
  mealsLogged: number;
  targetWaterMl: number;
  targetKcal: number;
  waterGoalAchieved: boolean;
  kcalGoalAchieved: boolean;
  proteinGoalAchieved: boolean;
  carbsGoalAchieved: boolean;
  fatGoalAchieved: boolean;
  createdAt: string;
}

export interface NutritionHistoryResponse {
  currentStreak: number;
  history: NutritionHistory[];
}

export interface Food {
  id: string;
  name: string;
  isCustom: boolean;
  userId: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealEntry {
  id: string;
  mealId: string;
  foodId: string;
  food: Food;
  amountGrams: number;
  createdAt: string;
}

export interface Meal {
  id: string;
  name: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
  loggedAt: string;
  entries: MealEntry[];
}

// =====================================
// API Calls
// =====================================

export function getTimeContext() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  // Obtém a data local convertendo os milissegundos para manter precisão de fuso no ISO
  const localDateStr = new Date(now.getTime() - offset * 60000).toISOString().split('T')[0];
  return { referenceDate: localDateStr, timezoneOffset: offset };
}

export async function getNutritionHistory(): Promise<NutritionHistoryResponse> {
  const data = await apiFetch('/nutrition/history');
  return data;
}

export async function getCurrentGoal(): Promise<NutritionGoal | null> {
  try {
    const ctx = getTimeContext();
    const data = await apiFetch(`/nutrition/goals/current?referenceDate=${ctx.referenceDate}&timezoneOffset=${ctx.timezoneOffset}`);
    return data;
  } catch (error: any) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function recalculateGoal(): Promise<NutritionGoal> {
  const data = await apiFetch('/nutrition/goals/recalculate', { method: 'POST', data: {} });
  return data;
}

export async function getWaterLogs(): Promise<WaterIntakeLog[]> {
  const ctx = getTimeContext();
  const endpoint = `/nutrition/water?referenceDate=${ctx.referenceDate}&timezoneOffset=${ctx.timezoneOffset}`;
  const data = await apiFetch(endpoint);
  return data;
}

export async function addWaterLog(amountMl: number): Promise<WaterIntakeLog> {
  const ctx = getTimeContext();
  const data = await apiFetch('/nutrition/water', {
    method: 'POST',
    data: { amountMl, ...ctx }
  });
  return data;
}

export async function getWeightLogs(): Promise<WeightLog[]> {
  const data = await apiFetch('/nutrition/weight');
  return data;
}

export async function addWeightLog(weightKg: number): Promise<WeightLog> {
  const ctx = getTimeContext();
  const data = await apiFetch('/nutrition/weight', {
    method: 'POST',
    data: { weightKg, ...ctx }
  });
  return data;
}

export async function getFoods(search?: string): Promise<Food[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch(`/foods${query}`);
}

export async function createCustomFood(data: { name: string, kcal: number, proteinG: number, carbsG: number, fatG: number }): Promise<Food> {
  return apiFetch('/foods', { method: 'POST', data });
}

export async function getMeals(): Promise<Meal[]> {
  const ctx = getTimeContext();
  return apiFetch(`/meals?referenceDate=${ctx.referenceDate}&timezoneOffset=${ctx.timezoneOffset}`);
}

export async function addMealEntry(category: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK', foodId: string, amountGrams: number): Promise<any> {
  const ctx = getTimeContext();
  return apiFetch('/meals/entries', {
    method: 'POST',
    data: { category, foodId, amountGrams, ...ctx }
  });
}

export async function removeMealEntry(entryId: string): Promise<void> {
  return apiFetch(`/meals/entries/${entryId}`, { method: 'DELETE' });
}

