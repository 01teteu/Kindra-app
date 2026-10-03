import { useState } from 'react';
import { Plus, Coffee, Sun, Moon, Apple, Trash2 } from 'lucide-react';
import type { Meal } from '../../lib/nutrition';
import { AddFoodModal } from './AddFoodModal';
import { Card } from '../ui/Card';
import { removeMealEntry } from '../../lib/nutrition';

const CATEGORY_CONFIG = {
  BREAKFAST: { label: 'Café da Manhã', icon: Coffee, color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
  LUNCH: { label: 'Almoço', icon: Sun, color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
  DINNER: { label: 'Jantar', icon: Moon, color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
  SNACK: { label: 'Lanches', icon: Apple, color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' }
} as const;

type CategoryKeys = keyof typeof CATEGORY_CONFIG;

interface MealTrackerProps {
  meals: Meal[];
  onUpdate: () => void;
  isLoading?: boolean;
}

export function MealTracker({ meals, onUpdate, isLoading = false }: MealTrackerProps) {
  const [activeCategory, setActiveCategory] = useState<Meal['name'] | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteEntry = async (entryId: string) => {
    if (confirmDeleteId !== entryId) {
      setConfirmDeleteId(entryId);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => {
        setConfirmDeleteId((current) => (current === entryId ? null : current));
      }, 3000);
      return;
    }

    try {
      setIsDeleting(entryId);
      await removeMealEntry(entryId);
      onUpdate();
    } catch (error) {
      console.error("Erro ao remover alimento:", error);
    } finally {
      setIsDeleting(null);
      setConfirmDeleteId(null);
    }
  };

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
          <div key={i} className="h-32 bg-kindra-100 rounded-[20px] border border-kindra-200 shadow-sm" />
        ))}
      </div>
    );
  }

  const categories: CategoryKeys[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

  return (
    <>
      <div className="nutrition-meals">
        <h2 className="nutrition-meals-title">Suas refeições</h2>

        <div className="nutrition-meals-grid">
          {categories.map(category => {
            const config = CATEGORY_CONFIG[category];
            const Icon = config.icon;
            const meal = getMealData(category);
            const totals = calculateTotals(meal);
            const hasEntries = meal && meal.entries.length > 0;

            return (
              <Card
                key={category}
                className={`nutrition-meal-card ${hasEntries ? 'is-filled' : 'is-empty'}`}
              >
                {/* Header */}
                <div className="nutrition-meal-header">
                  <div className="nutrition-meal-heading">
                    <div className={`nutrition-meal-icon ${config.color}`}>
                      <Icon size={21} aria-hidden="true" />
                    </div>
                    <div className="nutrition-meal-heading-copy">
                      <h3 className="nutrition-meal-title text-base font-semibold text-kindra-950 tracking-tight leading-tight">{config.label}</h3>
                      <p className="nutrition-meal-calories text-sm font-medium text-kindra-500 mt-0.5">
                        <strong>{totals.kcal.toFixed(0)}</strong> kcal consumidas
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveCategory(category)}
                    aria-label={`Adicionar alimento em ${config.label}`}
                    className="nutrition-meal-add"
                  >
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </div>

                {/* Content */}
                <div className="nutrition-meal-content">
                  {hasEntries ? (
                    <div className="nutrition-meal-filled">
                      <div className="nutrition-meal-entries">
                        {meal.entries.map(entry => {
                          const multiplier = entry.amountGrams / 100;
                          return (
                            <div key={entry.id} className="nutrition-meal-entry">
                              <div className="nutrition-meal-entry-head">
                                <p className="nutrition-meal-entry-name">{entry.food.name}</p>
                                <button
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  disabled={isDeleting === entry.id}
                                  className={`nutrition-meal-remove rounded-lg flex items-center justify-center transition-colors px-2 disabled:opacity-50 ${
                                    confirmDeleteId === entry.id
                                      ? 'bg-rose-500 text-white shadow-sm'
                                      : 'bg-transparent text-rose-400 hover:bg-rose-500/10 hover:text-rose-400'
                                  }`}
                                  title="Remover alimento"
                                  aria-label={`${confirmDeleteId === entry.id ? 'Confirmar remoção de' : 'Remover'} ${entry.food.name}`}
                                >
                                  {isDeleting === entry.id ? (
                                    <div className="h-4 w-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                  ) : confirmDeleteId === entry.id ? (
                                    <span className="text-xs font-bold uppercase tracking-wider">Apagar?</span>
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              <div className="nutrition-meal-entry-meta">
                                <p className="nutrition-meal-entry-amount"><strong>{entry.amountGrams}</strong><span>g</span></p>
                                <p className="nutrition-meal-entry-kcal"><strong>{(entry.food.kcal * multiplier).toFixed(0)}</strong><span>kcal</span></p>
                              </div>
                              <dl className="nutrition-meal-entry-nutrients" aria-label={`Nutrientes de ${entry.food.name} em ${entry.amountGrams} g`}>
                                <div><dt>Proteínas</dt><dd>{(entry.food.proteinG * multiplier).toFixed(1)}<span>g</span></dd></div>
                                <div><dt>Carboidratos</dt><dd>{(entry.food.carbsG * multiplier).toFixed(1)}<span>g</span></dd></div>
                                <div><dt>Gorduras</dt><dd>{(entry.food.fatG * multiplier).toFixed(1)}<span>g</span></dd></div>
                              </dl>
                            </div>
                          );
                        })}
                      </div>

                      {/* Sub-macros summary */}
                      <div className="nutrition-meal-macros">
                        <div className="nutrition-meal-macro">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Proteínas</div>
                          <strong>{totals.protein.toFixed(1)}<span>g</span></strong>
                        </div>
                        <div className="nutrition-meal-macro">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Carbos</div>
                          <strong>{totals.carbs.toFixed(1)}<span>g</span></strong>
                        </div>
                        <div className="nutrition-meal-macro">
                          <div className="text-xs font-medium text-kindra-500 mb-1">Gorduras</div>
                          <strong>{totals.fat.toFixed(1)}<span>g</span></strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="nutrition-meal-empty-wrap">
                      <p className="nutrition-meal-empty text-sm font-medium text-kindra-400">Nenhum alimento registrado.</p>
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
