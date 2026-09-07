import { useState, useEffect, useRef } from 'react';
import { NutritionOverview, type ConsumedTotals } from '../components/nutri/NutritionOverview';
import { WaterTracker } from '../components/nutri/WaterTracker';
import { WeightTracker } from '../components/nutri/WeightTracker';
import { StreakPanel } from '../components/nutri/StreakPanel';
import { NutritionHistoryModal } from '../components/nutri/NutritionHistoryModal';
import { MealTracker } from '../components/nutri/MealTracker';
import { MoreVertical, CalendarDays, RefreshCw } from 'lucide-react';
import * as nutritionApi from '../lib/nutrition';
import type { NutritionGoal, WaterIntakeLog, WeightLog, NutritionHistoryResponse, Meal } from '../lib/nutrition';

export function Nutri() {
  const [goal, setGoal] = useState<NutritionGoal | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterIntakeLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [streakData, setStreakData] = useState<NutritionHistoryResponse | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isAddingWater, setIsAddingWater] = useState(false);
  const [isAddingWeight, setIsAddingWeight] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [currentGoal, water, weight, historyRes, mealsData] = await Promise.all([
        nutritionApi.getCurrentGoal(),
        nutritionApi.getWaterLogs(),
        nutritionApi.getWeightLogs(),
        nutritionApi.getNutritionHistory(),
        nutritionApi.getMeals()
      ]);

      setGoal(currentGoal);
      setWaterLogs(water);
      setWeightLogs(weight);
      setStreakData(historyRes);
      setMeals(mealsData);
    } catch (error) {
      console.error('Failed to fetch nutri data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const calculateConsumedTotals = (): ConsumedTotals => {
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
  };

  const consumedTotals = calculateConsumedTotals();

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const newGoal = await nutritionApi.recalculateGoal();
      setGoal(newGoal);
    } catch (error) {
      console.error('Failed to recalculate:', error);
      alert('Não foi possível recalcular. Verifique se seu perfil (incluindo o Sexo Biológico) está completo.');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleAddWater = async (ml: number) => {
    setIsAddingWater(true);
    try {
      const newLog = await nutritionApi.addWaterLog(ml);
      setWaterLogs([newLog, ...waterLogs]);
    } catch (error) {
      console.error('Failed to add water:', error);
    } finally {
      setIsAddingWater(false);
    }
  };

  const handleAddWeight = async (kg: number) => {
    setIsAddingWeight(true);
    try {
      const newLog = await nutritionApi.addWeightLog(kg);
      setWeightLogs([newLog, ...weightLogs]);
    } catch (error) {
      console.error('Failed to add weight:', error);
    } finally {
      setIsAddingWeight(false);
    }
  };

  const currentWaterMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);
  const targetWaterMl = goal?.targetWaterMl || 2000;
  
  // A meta de hoje está batida se bebeu água suficiente (e a meta for > 0)
  const todayAchieved = targetWaterMl > 0 && currentWaterMl >= targetWaterMl;

  return (
    <div className="min-h-screen p-4 relative overflow-hidden bg-kindra-50 pb-24">
      {/* Subtle Studio Lighting Effect */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-300/20 blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-2xl mx-auto relative z-10 pt-4 px-2 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-kindra-950 tracking-tight">
              Nutrição
            </h1>
            <p className="text-sm font-medium text-kindra-500 mt-1">
              Seu acompanhamento diário
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-xl bg-white shadow-sm border border-kindra-200 text-kindra-600 hover:text-kindra-900 hover:bg-kindra-50 transition-colors"
              title="Opções"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl shadow-black/10 border border-kindra-100 z-50 overflow-hidden py-1">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsHistoryOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-kindra-700 hover:bg-kindra-50 transition-colors"
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  Ver Histórico
                </button>
                
                <div className="h-px w-full bg-kindra-100 my-1" />
                
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleRecalculate();
                  }}
                  disabled={isRecalculating}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-kindra-700 hover:bg-kindra-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 ${isRecalculating ? 'animate-spin' : ''}`} />
                  Recalcular Metas
                </button>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-48 bg-white/50 rounded-2xl"></div>
            <div className="h-40 bg-white/50 rounded-2xl"></div>
            <div className="h-32 bg-white/50 rounded-2xl"></div>
          </div>
        ) : (
          <>
            <StreakPanel 
              streak={streakData?.currentStreak || 0} 
              history={streakData?.history || []} 
              todayAchieved={todayAchieved} 
            />

            <NutritionOverview 
              goal={goal} 
              consumed={consumedTotals}
            />
            
            <MealTracker 
              meals={meals}
              isLoading={isLoading}
              onUpdate={fetchDashboardData}
            />
            
            <WaterTracker 
              currentMl={currentWaterMl} 
              targetMl={targetWaterMl} 
              onAddWater={handleAddWater} 
              isAdding={isAddingWater} 
            />

            <WeightTracker 
              logs={weightLogs} 
              onAddWeight={handleAddWeight} 
              isAdding={isAddingWeight} 
            />
          </>
        )}
      </div>

      <NutritionHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </div>
  );
}
