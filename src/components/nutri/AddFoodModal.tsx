import { Sheet } from '../ui/Sheet';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, Loader2, Info, ChevronRight, CircleAlert, Check } from 'lucide-react';
import * as nutritionApi from '../../lib/nutrition';
import type { Food, Meal } from '../../lib/nutrition';
import { CreateFoodModal } from './CreateFoodModal';

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Meal['name'] | null;
  onSuccess: () => void; // Trigger a refresh in MealTracker
}

const CATEGORY_NAMES = {
  BREAKFAST: 'Café da Manhã',
  LUNCH: 'Almoço',
  DINNER: 'Jantar',
  SNACK: 'Lanches'
};

export function AddFoodModal({ isOpen, onClose, category, onSuccess }: AddFoodModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState<string>('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedFood(null);
      setAmount('100');
      searchFoods('');
    }
  }, [isOpen]);

  const searchFoods = async (query: string) => {
    setIsLoading(true);
    setSearchError('');
    try {
      const results = await nutritionApi.getFoods(query);
      setFoods(results);
    } catch (err) {
      console.error('Failed to fetch foods:', err);
      setSearchError('Não foi possível buscar alimentos. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      searchFoods(value);
    }, 400); // Debounce
  };

  const handleAddEntry = async () => {
    if (!category || !selectedFood || !amount) return;

    setIsSubmitting(true);
    try {
      await nutritionApi.addMealEntry(category, selectedFood.id, Number(amount));
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to add meal entry:', err);
      alert('Erro ao adicionar alimento à refeição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSuccess = (newFood: Food) => {
    setFoods([newFood, ...foods]);
    setSelectedFood(newFood);
    setAmount('100');
  };

  if (!isOpen) return null;

  return (
    <>
      <Sheet open={isOpen} onClose={onClose} label="Adicionar alimento">
        <div className="sheet-panel relative flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-kindra-200 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold leading-tight tracking-tight text-kindra-950">
                Adicionar em {category ? CATEGORY_NAMES[category] : ''}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-kindra-500">
                {selectedFood ? 'Ajuste a porção antes de adicionar.' : 'Encontre um alimento para sua refeição.'}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Fechar busca de alimentos"
              className="w-11 shrink-0 px-0"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
            {!selectedFood ? (
              <div>
                <div className="sticky top-0 z-10 space-y-3 border-b border-kindra-200 bg-kindra-100 px-5 pt-5 pb-3 sm:px-6">
                  <label htmlFor="add-food-search" className="block text-sm font-medium text-kindra-700">
                    Buscar alimento
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-kindra-400" aria-hidden="true" />
                    <Input
                      id="add-food-search"
                      type="search"
                      aria-label="Buscar alimento"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      placeholder="Digite o nome do alimento"
                      className="pl-11"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-kindra-900">{searchTerm ? 'Resultados da busca' : 'Alimentos disponíveis'}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateModalOpen(true)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Criar alimento
                    </Button>
                  </div>
                </div>

                <div className="px-5 py-5 sm:px-6" aria-busy={isLoading}>
                  {searchError ? (
                    <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
                      <div className="flex items-start gap-3">
                        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-kindra-950">Não foi possível carregar a lista</p>
                          <p className="mt-1 text-sm leading-relaxed text-kindra-500">{searchError}</p>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => searchFoods(searchTerm)}>
                        Tentar novamente
                      </Button>
                    </div>
                  ) : isLoading ? (
                    <div role="status" className="flex flex-col items-center gap-3 py-12 text-sm text-kindra-500">
                      <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-teal-400" aria-hidden="true" />
                      Buscando alimentos…
                    </div>
                  ) : foods.length === 0 ? (
                    <div role="status" className="flex flex-col items-center rounded-2xl border border-kindra-200 bg-kindra-50 px-5 py-10 text-center">
                      <Search className="mb-4 h-6 w-6 text-kindra-400" aria-hidden="true" />
                      <p className="text-base font-semibold text-kindra-950">Nenhum alimento encontrado</p>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-kindra-500">
                        Tente outro nome ou use “Criar alimento” para cadastrar o seu.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-kindra-500">Valores nutricionais por 100 g</p>
                      <ul className="space-y-2" aria-label="Alimentos encontrados">
                        {foods.map(food => (
                          <li key={food.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedFood(food)}
                              className="group flex w-full items-center gap-3 rounded-2xl border border-kindra-200 bg-kindra-50 p-4 text-left transition-colors hover:border-kindra-300 hover:bg-kindra-200/30 focus-visible:border-teal-400 active:bg-kindra-200"
                            >
                              <span className="min-w-0 flex-1 space-y-3">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="break-words text-sm font-semibold leading-relaxed text-kindra-950">{food.name}</span>
                                  {food.isCustom && (
                                    <span className="rounded-md border border-kindra-300 px-2 py-0.5 text-xs font-medium text-kindra-500">Personalizado</span>
                                  )}
                                </span>
                                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xs text-kindra-500 tabular-nums">
                                  <span className="text-sm font-semibold text-kindra-900">{Number(food.kcal).toFixed(0)} <span className="text-xs font-normal text-kindra-500">kcal</span></span>
                                  <span>Prot. <span className="text-kindra-700">{Number(food.proteinG).toFixed(1)} g</span></span>
                                  <span>Carb. <span className="text-kindra-700">{Number(food.carbsG).toFixed(1)} g</span></span>
                                  <span>Gord. <span className="text-kindra-700">{Number(food.fatG).toFixed(1)} g</span></span>
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-kindra-400 transition-colors group-hover:text-teal-300 group-focus-visible:text-teal-300" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5 sm:px-6">
                <div className="bg-kindra-50 p-4 sm:p-5 rounded-2xl border border-kindra-200">
                  <p className="mb-3 flex items-center gap-2 text-xs font-medium text-teal-300"><Check className="h-4 w-4" aria-hidden="true" />Alimento selecionado</p>
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <h3 className="min-w-0 break-words font-display font-semibold text-kindra-950 text-lg leading-relaxed">{selectedFood.name}</h3>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedFood(null)} className="shrink-0">
                      Trocar
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center mb-6 tabular-nums">
                    <div className="bg-teal-500/10 rounded-xl p-3 border border-teal-500/20">
                      <div className="text-xs font-medium text-teal-300 mb-1">Kcal</div>
                      <div className="font-semibold text-kindra-950 text-lg break-words">{((selectedFood.kcal / 100) * Number(amount || 0)).toFixed(0)}</div>
                    </div>
                    <div className="bg-kindra-100 rounded-xl p-3 border border-kindra-200">
                      <div className="text-xs font-medium text-kindra-500 mb-1">Prot</div>
                      <div className="font-semibold text-kindra-950 text-lg break-words">{((selectedFood.proteinG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                    <div className="bg-kindra-100 rounded-xl p-3 border border-kindra-200">
                      <div className="text-xs font-medium text-kindra-500 mb-1">Carb</div>
                      <div className="font-semibold text-kindra-950 text-lg break-words">{((selectedFood.carbsG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                    <div className="bg-kindra-100 rounded-xl p-3 border border-kindra-200">
                      <div className="text-xs font-medium text-kindra-500 mb-1">Gord</div>
                      <div className="font-semibold text-kindra-950 text-lg break-words">{((selectedFood.fatG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label htmlFor="add-food-amount" className="block text-center text-sm font-medium text-kindra-700">Quantidade consumida</label>
                    <div className="flex items-center justify-center gap-3">
                      <input
                        id="add-food-amount"
                        type="number" inputMode="decimal" aria-label="Quantidade consumida em gramas"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="kindra-input w-36 text-center text-2xl font-semibold tabular-nums"
                        min="1"
                        max="3000"
                      />
                      <span className="text-kindra-500 text-sm">g</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 px-1">
                  <Info className="h-4 w-4 text-kindra-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-kindra-500 leading-relaxed">
                    Ajuste a quantidade em gramas. Os valores nutricionais acima serão recalculados automaticamente com base na proporção.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedFood && (
            <div className="px-5 sm:px-6 pb-6 pt-4 border-t border-kindra-200 bg-kindra-100 shrink-0">
              <Button
                type="button"
                isLoading={isSubmitting}
                onClick={handleAddEntry}
                disabled={isSubmitting || !amount || Number(amount) <= 0}
                className="w-full"
              >
                {isSubmitting ? 'Adicionando…' : `Adicionar ${Number(amount || 0)} g`}
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      <CreateFoodModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
