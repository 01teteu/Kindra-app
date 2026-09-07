import { useState, useEffect } from 'react';
import { Plus, Coffee, Sun, Moon, Apple } from 'lucide-react';
import type { Meal } from '../../lib/nutrition';
import { AddFoodModal } from './AddFoodModal';
import { Card } from '../ui/Card';

const CATEGORY_CONFIG = {
  BREAKFAST: { label: 'Café da Manhã', icon: Coffee, color: 'bg-orange-50 text-orange-600 border-orange-100' },
  LUNCH: { label: 'Almoço', icon: Sun, color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  DINNER: { label: 'Jantar', icon: Moon, color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  SNACK: { label: 'Lanches', icon: Apple, color: 'bg-green-50 text-green-600 border-green-100' }
} as const;

type CategoryKeys = keyof typeof CATEGORY_CONFIG;

interface MealTrackerProps {
  meals: Meal[];
  onUpdate: () => void;
  isLoading?: boolean;
}

export function MealTracker({ meals, onUpdate, isLoading = false }: MealTrackerProps) {
  const [activeCategory, setActiveCategory] = useState<Meal['name'] | null>(null);

  const getMealData = (category: CategoryKeys) => {
    return meals.find(m => m.name === category);
  };

  const calculateTotals = (meal?: Meal) => {
    if (!meal) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return meal.entries.reduce((acc, entry) => {
      const multiplier = entry.amountGrams / 100;
      return {
        kcal: acc.kcal + (entry.food.kcal * multiplier),
        protein: acc.protein + (entry.food.proteinG * multiplier),
        carbs: acc.carbs + (entry.food.carbsG * multiplier),
        fat: acc.fat + (entry.food.fatG * multiplier),
      };
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-white/60 rounded-3xl border border-white/40 shadow-sm" />
        ))}
      </div>
    );
  }

  const categories: CategoryKeys[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold text-kindra-900 px-1">Diário de Refeições</h2>
        
        <div className="space-y-4">
          {categories.map(category => {
            const config = CATEGORY_CONFIG[category];
            const Icon = config.icon;
            const meal = getMealData(category);
            const totals = calculateTotals(meal);
            const hasEntries = meal && meal.entries.length > 0;

            return (
              <Card 
                key={category} 
                className="p-0 overflow-hidden relative transition-all duration-300 hover:shadow-2xl"
              >
                {/* Header */}
                <div className="p-6 flex items-center justify-between border-b border-kindra-200/50">
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center shadow-lg shadow-black/5 border ${config.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-xl font-display font-bold text-kindra-950 tracking-tight leading-tight">{config.label}</h3>
                      <p className="text-sm font-medium text-kindra-500 mt-0.5">
                        {totals.kcal.toFixed(0)} kcal consumidas
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveCategory(category)}
                    className="h-10 w-10 rounded-xl bg-white border border-kindra-200 flex items-center justify-center text-kindra-600 hover:bg-kindra-50 hover:text-kindra-900 transition-colors group shadow-sm"
                  >
                    <Plus className="h-5 w-5 group-hover:scale-110 transition-transform" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 bg-kindra-50/30">
                  {hasEntries ? (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-4">
                        {meal.entries.map(entry => {
                          const multiplier = entry.amountGrams / 100;
                          return (
                            <div key={entry.id} className="flex justify-between items-center gap-4">
                              <div>
                                <p className="text-base font-semibold text-kindra-900 line-clamp-1">{entry.food.name}</p>
                                <p className="text-sm text-kindra-500">{entry.amountGrams}g</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-base font-bold text-kindra-950">{(entry.food.kcal * multiplier).toFixed(0)} <span className="text-sm font-medium text-kindra-500">kcal</span></p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Sub-macros summary */}
                      <div className="grid grid-cols-3 gap-3 pt-6 mt-2 border-t border-kindra-200/50">
                        <div className="bg-kindra-50/50 rounded-xl p-3 border border-kindra-100/50 flex flex-col items-center text-center">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Proteínas</div>
                          <div className="text-sm font-semibold text-kindra-900">{totals.protein.toFixed(1)}g</div>
                        </div>
                        <div className="bg-kindra-50/50 rounded-xl p-3 border border-kindra-100/50 flex flex-col items-center text-center">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Carbos</div>
                          <div className="text-sm font-semibold text-kindra-900">{totals.carbs.toFixed(1)}g</div>
                        </div>
                        <div className="bg-kindra-50/50 rounded-xl p-3 border border-kindra-100/50 flex flex-col items-center text-center">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Gorduras</div>
                          <div className="text-sm font-semibold text-kindra-900">{totals.fat.toFixed(1)}g</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-sm font-medium text-kindra-400">Nenhum alimento registrado.</p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <AddFoodModal 
        isOpen={activeCategory !== null}
        onClose={() => setActiveCategory(null)}
        category={activeCategory}
        onSuccess={onUpdate}
      />
    </>
  );
}
