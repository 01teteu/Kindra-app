import { useState } from 'react';
import { Plus, Sunrise, Sun, Moon, Leaf, Soup, Trash2 } from 'lucide-react';
import type { Meal } from '../../lib/nutrition';
import { AddFoodModal } from './AddFoodModal';
import { Card } from '../ui/Card';
import { removeMealEntry } from '../../lib/nutrition';

const CATEGORY_CONFIG = {
  BREAKFAST: { label: 'Café da Manhã', icon: Sunrise },
  LUNCH: { label: 'Almoço', icon: Sun },
  DINNER: { label: 'Jantar', icon: Moon },
  SNACK: { label: 'Lanches', icon: Leaf }
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
      <div className="nutrition-meals-loading animate-pulse motion-reduce:animate-none" role="status" aria-label="Carregando refeições">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="nutrition-meal-loading-row" />
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
                    <div className="nutrition-meal-icon" aria-hidden="true">
                      <Icon size={23} strokeWidth={1.7} />
                    </div>
                    <div className="nutrition-meal-heading-copy">
                      <h3 className="nutrition-meal-title">{config.label}</h3>
                      <p className="nutrition-meal-calories">
                        <strong>{totals.kcal.toFixed(0)}</strong> kcal
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

                {hasEntries ? (
                  <div className="nutrition-meal-content">
                    <div className="nutrition-meal-filled">
                      <div className="nutrition-meal-entries">
                        {meal.entries.map(entry => {
                          const multiplier = entry.amountGrams / 100;
                          return (
                            <div key={entry.id} className="nutrition-meal-entry">
                              <span className="nutrition-meal-entry-icon" aria-hidden="true"><Soup size={23} strokeWidth={1.7} /></span>
                              <div className="nutrition-meal-entry-copy">
                                <p className="nutrition-meal-entry-name">{entry.food.name}</p>
                                <p className="nutrition-meal-entry-amount"><strong>{entry.amountGrams}</strong><span> g</span></p>
                              </div>
                              <p className="nutrition-meal-entry-kcal"><strong>{(entry.food.kcal * multiplier).toFixed(0)}</strong><span>kcal</span></p>
                              <dl className="nutrition-meal-entry-nutrients" aria-label={`Nutrientes de ${entry.food.name} em ${entry.amountGrams} g`}>
                                <div><dt aria-label="Proteínas">P</dt><dd>{(entry.food.proteinG * multiplier).toFixed(1)}<span> g</span></dd></div>
                                <div><dt aria-label="Carboidratos">C</dt><dd>{(entry.food.carbsG * multiplier).toFixed(1)}<span> g</span></dd></div>
                                <div><dt aria-label="Gorduras">G</dt><dd>{(entry.food.fatG * multiplier).toFixed(1)}<span> g</span></dd></div>
                              </dl>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                disabled={isDeleting === entry.id}
                                className={`nutrition-meal-remove ${confirmDeleteId === entry.id ? 'is-confirming' : ''}`}
                                title="Remover alimento"
                                aria-label={`${confirmDeleteId === entry.id ? 'Confirmar remoção de' : 'Remover'} ${entry.food.name}`}
                              >
                                {isDeleting === entry.id ? (
                                  <div className="h-4 w-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                ) : confirmDeleteId === entry.id ? (
                                  <span>Apagar?</span>
                                ) : (
                                  <Trash2 size={17} aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="nutrition-meal-macros">
                        <div className="nutrition-meal-total-kcal">
                          <span>Total da refeição</span>
                          <strong>{totals.kcal.toFixed(0)} <small>kcal</small></strong>
                        </div>
                        <dl className="nutrition-meal-total-macros">
                          <div><dt aria-label="Proteínas">P</dt><dd>{totals.protein.toFixed(1)}<span> g</span></dd></div>
                          <div><dt aria-label="Carboidratos">C</dt><dd>{totals.carbs.toFixed(1)}<span> g</span></dd></div>
                          <div><dt aria-label="Gorduras">G</dt><dd>{totals.fat.toFixed(1)}<span> g</span></dd></div>
                        </dl>
                      </div>
                    </div>
                  </div>
                ) : <span className="sr-only">Nenhum alimento registrado em {config.label}.</span>}
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
