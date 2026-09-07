import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, Loader2, Info } from 'lucide-react';
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
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState<string>('100');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const searchTimeout = useRef<NodeJS.Timeout>();

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
    try {
      const results = await nutritionApi.getFoods(query);
      setFoods(results);
    } catch (err) {
      console.error('Failed to fetch foods:', err);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md">
        <div 
          className="absolute inset-0"
          onClick={onClose}
        />
        
        <div className="relative bg-kindra-100 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 border border-kindra-200/50 backdrop-blur-xl">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-between bg-kindra-100 shrink-0">
            <div>
              <h2 className="text-2xl font-display font-semibold text-kindra-950">
                Adicionar em {category ? CATEGORY_NAMES[category] : ''}
              </h2>
              <p className="text-sm text-kindra-500 mt-1">Busque na base TACO ou crie o seu</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2.5 text-kindra-400 hover:text-kindra-950 hover:bg-kindra-200/50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-kindra-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 overflow-y-auto custom-scrollbar flex-1">
            {!selectedFood ? (
              <div className="space-y-4 mt-2">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-kindra-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Buscar alimento..."
                    className="w-full pl-11 pr-4 py-3.5 bg-white border border-kindra-200 rounded-2xl text-kindra-900 placeholder:text-kindra-400 focus:outline-none focus:ring-2 focus:ring-kindra-500/20 focus:border-kindra-500 transition-all shadow-sm"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 px-1">
                  <span className="text-sm font-semibold text-kindra-900">Resultados</span>
                  <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="text-sm font-medium text-kindra-600 hover:text-kindra-900 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Novo
                  </button>
                </div>

                {isLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="h-6 w-6 text-kindra-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {foods.length === 0 ? (
                      <div className="py-10 text-center flex flex-col items-center bg-kindra-200/30 rounded-3xl border border-kindra-300/30 border-dashed">
                        <span className="text-kindra-500 text-sm font-medium">Nenhum alimento encontrado.</span>
                      </div>
                    ) : (
                      foods.map(food => (
                        <button
                          key={food.id}
                          onClick={() => setSelectedFood(food)}
                          className="w-full text-left p-5 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm hover:bg-slate-100 hover:border-slate-300 hover:shadow-md transition-all group flex flex-col gap-3"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <h3 className="font-semibold text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-2">
                              {food.name}
                            </h3>
                            {food.isCustom && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider shrink-0 border border-blue-100">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-slate-500">
                            <span className="text-orange-700 bg-orange-50 border border-orange-100 px-2 py-1 rounded-md">
                              {Number(food.kcal).toFixed(0)} kcal
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>P: {Number(food.proteinG).toFixed(1)}g</span>
                            <span className="text-slate-300">|</span>
                            <span>C: {Number(food.carbsG).toFixed(1)}g</span>
                            <span className="text-slate-300">|</span>
                            <span>G: {Number(food.fatG).toFixed(1)}g</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-200 mt-2">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <h3 className="font-display font-semibold text-slate-900 text-xl leading-tight">{selectedFood.name}</h3>
                    <button 
                      onClick={() => setSelectedFood(null)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-slate-200/60 hover:bg-slate-300/60 transition-colors shrink-0"
                    >
                      Trocar
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center mb-8">
                    <div className="bg-white rounded-2xl p-3 border border-slate-200/60 shadow-sm">
                      <div className="text-xs font-medium text-slate-500 mb-1">Kcal</div>
                      <div className="font-semibold text-slate-900 text-lg">{((selectedFood.kcal / 100) * Number(amount || 0)).toFixed(0)}</div>
                    </div>
                    <div className="bg-orange-50 rounded-2xl p-3 border border-orange-100/50 shadow-sm">
                      <div className="text-xs font-medium text-orange-600 mb-1">Prot</div>
                      <div className="font-semibold text-orange-950 text-lg">{((selectedFood.proteinG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                    <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100/50 shadow-sm">
                      <div className="text-xs font-medium text-blue-600 mb-1">Carb</div>
                      <div className="font-semibold text-blue-950 text-lg">{((selectedFood.carbsG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                    <div className="bg-yellow-50 rounded-2xl p-3 border border-yellow-100/50 shadow-sm">
                      <div className="text-xs font-medium text-yellow-600 mb-1">Gord</div>
                      <div className="font-semibold text-yellow-950 text-lg">{((selectedFood.fatG / 100) * Number(amount || 0)).toFixed(1)}g</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-slate-900 block text-center">Quantidade Consumida (gramas)</label>
                    <div className="flex items-center justify-center gap-3">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-36 text-center text-3xl font-display font-bold px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:border-slate-800 focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                        min="1"
                        max="3000"
                      />
                      <span className="text-slate-500 font-medium text-lg">g</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-100/80 rounded-2xl border border-slate-200/80">
                  <Info className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Ajuste a quantidade em gramas. Os valores nutricionais acima serão recalculados automaticamente com base na proporção.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {selectedFood && (
            <div className="px-6 pb-6 pt-4 bg-kindra-100 shrink-0">
              <button
                onClick={handleAddEntry}
                disabled={isSubmitting || !amount || Number(amount) <= 0}
                className="w-full flex items-center justify-center py-4 px-4 bg-kindra-900 text-white rounded-2xl font-medium text-lg hover:bg-kindra-800 focus:outline-none focus:ring-2 focus:ring-kindra-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  `Adicionar ${Number(amount || 0)}g`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <CreateFoodModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
