import { useState, useEffect, useRef } from 'react';
import { NutritionOverview, type ConsumedTotals } from '../components/nutri/NutritionOverview';
import { WaterTracker } from '../components/nutri/WaterTracker';
import { WeightTracker } from '../components/nutri/WeightTracker';
import { StreakPanel } from '../components/nutri/StreakPanel';
import { MealTracker } from '../components/nutri/MealTracker';
import { AreaWelcome } from '../components/nutri/AreaWelcome';
import { MoreVertical, RefreshCw, Calendar, Droplet, Beef, Wheat, Flame } from 'lucide-react';
import * as nutritionApi from '../lib/nutrition';
import type { NutritionGoal, WaterIntakeLog, WeightLog, NutritionHistoryResponse, Meal } from '../lib/nutrition';

export function Nutri() {
  const [activeTab, setActiveTab] = useState<'diario' | 'hidratacao'>('diario');
  const [goal, setGoal] = useState<NutritionGoal | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterIntakeLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [streakData, setStreakData] = useState<NutritionHistoryResponse | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isAddingWater, setIsAddingWater] = useState(false);
  const [removingWaterId, setRemovingWaterId] = useState<string | null>(null);
  const [isRefreshingWater, setIsRefreshingWater] = useState(false);
  const [waterError, setWaterError] = useState('');
  const [waterNotice, setWaterNotice] = useState('');
  const waterBusy = useRef(false);
  const [isAddingWeight, setIsAddingWeight] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
    setLoadError('');
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
      setLoadError('Não foi possível carregar seu diário. Tente novamente.');
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
    if (waterBusy.current) return false;
    waterBusy.current = true;
    setIsAddingWater(true);
    setWaterError('');
    setWaterNotice('');
    try {
      const newLog = await nutritionApi.addWaterLog(ml);
      setWaterLogs(previous => [newLog, ...previous]);
      setWaterNotice(`${ml} ml registrados.`);
      return true;
    } catch (error) {
      console.error('Failed to add water:', error);
      setWaterError('Não foi possível registrar a água. Tente novamente.');
      return false;
    } finally {
      setIsAddingWater(false);
      waterBusy.current = false;
    }
  };

  const handleRefreshWater = async () => {
    if (waterBusy.current) return;
    waterBusy.current = true;
    setIsRefreshingWater(true);
    setWaterError('');
    setWaterNotice('');
    try {
      setWaterLogs(await nutritionApi.getWaterLogs());
      setWaterNotice('Registros de hoje atualizados.');
    } catch {
      setWaterError('Não foi possível atualizar os registros. Tente novamente.');
    } finally {
      waterBusy.current = false;
      setIsRefreshingWater(false);
    }
  };

  const handleRemoveWater = async (id: string) => {
    if (waterBusy.current) return false;
    waterBusy.current = true;
    setRemovingWaterId(id);
    setWaterError('');
    setWaterNotice('');
    try {
      await nutritionApi.removeWaterLog(id);
      setWaterLogs(previous => previous.filter(log => log.id !== id));
      setWaterNotice('Registro removido. Consumo atualizado; sua meta continua igual.');
      try {
        setWaterLogs(await nutritionApi.getWaterLogs());
      } catch {
        setWaterError('O registro foi removido, mas não foi possível sincronizar a lista. Atualize os registros.');
      }
      return true;
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      setWaterError(status === 429
        ? 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.'
        : status === 404 || status === 400
          ? 'Registro indisponível para remoção. Apenas registros de hoje ainda não consolidados podem ser removidos. Atualize a lista.'
          : 'Não foi possível remover o registro. Atualize a lista para conferir o consumo antes de tentar novamente.');
      return false;
    } finally {
      setRemovingWaterId(null);
      waterBusy.current = false;
    }
  };

  const handleAddWeight = async (kg: number) => {
    setIsAddingWeight(true);
    setActionError('');
    try {
      const newLog = await nutritionApi.addWeightLog(kg);
      setWeightLogs([newLog, ...weightLogs]);
    } catch (error) {
      console.error('Failed to add weight:', error);
      setActionError('Não foi possível registrar o peso. Tente novamente.');
    } finally {
      setIsAddingWeight(false);
    }
  };

  const currentWaterMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);
  const targetWaterMl = goal?.targetWaterMl || 2000;

  // Verifica se o usuário bateu as tolerâncias exigidas das metas
  const isWithinTolerance = (consumed: number, target: number, margin: number) => {
    if (target <= 0) return false;
    return consumed >= target * (1 - margin) && consumed <= target * (1 + margin);
  };
  const isAboveFloor = (consumed: number, target: number, floorMargin: number) => {
    if (target <= 0) return false;
    return consumed >= target * (1 - floorMargin);
  };

  const todayKcalAchieved = goal ? isWithinTolerance(consumedTotals.kcal, goal.targetKcal, 0.10) : false;
  const todayProteinAchieved = goal ? isAboveFloor(consumedTotals.proteinG, goal.targetProteinG, 0.15) : false;
  const todayCarbsAchieved = goal ? isWithinTolerance(consumedTotals.carbsG, goal.targetCarbsG, 0.10) : false;
  const todayFatAchieved = goal ? isWithinTolerance(consumedTotals.fatG, goal.targetFatG, 0.10) : false;
  const todayWaterAchieved = targetWaterMl > 0 && currentWaterMl >= targetWaterMl;

  // A "chama" acende APENAS se todos passarem nas regras do jogo
  const todayAchieved = todayWaterAchieved && todayKcalAchieved && todayProteinAchieved && todayCarbsAchieved && todayFatAchieved;

  return (
    <div className="page-container">




      <div className="w-full">
        <div className="page-heading">
          <div>
            <h1 className="text-kindra-950">
              Nutrição
            </h1>
            <p className="text-sm font-medium text-kindra-500 mt-1">
              Pequenos hábitos. Todos os dias.
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="icon-button"
              title="Opções" aria-label="Opções de nutrição" aria-expanded={isMenuOpen}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-kindra-100 rounded-xl shadow-sm shadow-black/20 border border-kindra-200/50 z-50 overflow-hidden py-1">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleRecalculate();
                  }}
                  disabled={isRecalculating}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-kindra-700 hover:bg-kindra-200/50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 ${isRecalculating ? 'animate-spin' : ''}`} />
                  Recalcular Metas
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="segmented-tabs" role="tablist" aria-label="Acompanhamento nutricional">
          {(['diario', 'hidratacao'] as const).map((tab, index) => <button key={tab} id={`tab-${tab}`} role="tab"
            aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)} onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'diario' : event.key === 'End' ? 'hidratacao' : index === 0 ? 'hidratacao' : 'diario';
                setActiveTab(next); document.getElementById(`tab-${next}`)?.focus();
              }
            }}>{tab === 'diario' ? 'Diário' : 'Hidratação'}</button>)}
        </div>

        {actionError && <p role="alert" className="mb-4 p-4 rounded-xl bg-rose-500/10 text-rose-400 text-sm">{actionError}</p>}
        {loadError ? <div role="alert" className="kindra-card p-6 text-center"><p className="text-sm text-kindra-600 mb-4">{loadError}</p><button onClick={fetchDashboardData} className="kindra-button button-outline">Tentar novamente</button></div> : isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-48 bg-kindra-100 rounded-2xl"></div>
            <div className="h-40 bg-kindra-100 rounded-2xl"></div>
            <div className="h-32 bg-kindra-100 rounded-2xl"></div>
          </div>
        ) : (
          <>
            {activeTab === 'diario' && (
              <AreaWelcome area="diario" userId={goal?.userId}>
              <div className="nutrition-layout">
                <div className="nutrition-primary">
                  <NutritionOverview goal={goal} consumed={consumedTotals} />
                  <StreakPanel streak={streakData?.currentStreak || 0} history={streakData?.history || []} todayAchieved={todayAchieved} />
                  <WeightTracker logs={weightLogs} onAddWeight={handleAddWeight} isAdding={isAddingWeight} />
                </div>
                <div className="nutrition-secondary"><MealTracker meals={meals} isLoading={isLoading} onUpdate={fetchDashboardData} /></div>
              </div>
              </AreaWelcome>
            )}

            {activeTab === 'hidratacao' && (
              <AreaWelcome area="hidratacao" userId={goal?.userId}>
              <div className="nutrition-layout">
                <WaterTracker
                  currentMl={currentWaterMl}
                  targetMl={targetWaterMl}
                  onAddWater={handleAddWater}
                  isAdding={isAddingWater}
                  logs={waterLogs}
                  onRemoveWater={handleRemoveWater}
                  removingId={removingWaterId}
                  onRefresh={handleRefreshWater}
                  isRefreshing={isRefreshingWater}
                  error={waterError}
                  notice={waterNotice}
                />

                {/* --- HISTÓRICO DIÁRIO EMBUTIDO --- */}
                <div className="pt-2">
                  <div className="flex items-center gap-3 mb-4 px-1">
                    <div className="h-10 w-10 rounded-xl bg-kindra-200/50 flex items-center justify-center border border-kindra-300/30">
                      <Calendar className="h-5 w-5 text-kindra-900" />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-bold text-kindra-950">Histórico Diário</h3>
                      <p className="text-sm font-medium text-kindra-500">Seus registros anteriores</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(!streakData?.history || streakData.history.length === 0) ? (
                      <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-kindra-100/50 rounded-2xl border border-kindra-200/50">
                        <div className="h-16 w-16 bg-kindra-200/50 rounded-full flex items-center justify-center mb-4">
                          <Calendar className="h-7 w-7 text-kindra-500" />
                        </div>
                        <h3 className="text-lg font-bold text-kindra-950 mb-1">Nenhum registro</h3>
                        <p className="text-sm text-kindra-500 max-w-[240px] leading-relaxed">
                          Seus dados diários aparecerão aqui automaticamente após a meia-noite.
                        </p>
                      </div>
                    ) : (
                      streakData.history.map((day) => {
                        const dateObj = new Date(day.date);
                        const dateStr = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
                        const allAchieved = day.waterGoalAchieved && day.kcalGoalAchieved && day.proteinGoalAchieved && day.carbsGoalAchieved && day.fatGoalAchieved;

                        return (
                          <div key={day.id} className="bg-kindra-100/80 rounded-[24px] p-5 border border-kindra-200/50 shadow-sm relative overflow-hidden group">


                            <div className="relative z-10">
                              <div className="flex justify-between items-center mb-5">
                                <span className="font-display font-bold text-kindra-950 capitalize text-lg">{dateStr}</span>
                                {allAchieved ? (
                                  <span className="text-xs font-bold tracking-widest text-teal-300 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full uppercase flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                                    Perfeito
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold tracking-widest text-kindra-500 bg-kindra-200/50 border border-kindra-300/30 px-3 py-1.5 rounded-full uppercase">
                                    Incompleto
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2.5">
                                {/* Água recebe destaque extra */}
                                <div className={`rounded-2xl p-4 border transition-colors ${day.waterGoalAchieved ? 'bg-kindra-100 border-teal-500/30 shadow-sm shadow-teal-500/5' : 'bg-kindra-200/30 border-kindra-300/30'}`}>
                                  <div className="flex items-center gap-2 text-xs font-bold text-kindra-400 uppercase tracking-widest mb-1.5">
                                    <Droplet className={`h-4 w-4 ${day.waterGoalAchieved ? 'text-teal-500' : 'text-kindra-400'}`} /> Água
                                  </div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-display font-bold text-kindra-950">{day.waterIngestedMl}</span>
                                    <span className="text-xs font-medium text-kindra-500">ml</span>
                                  </div>
                                </div>

                                <div className={`rounded-2xl p-4 border transition-colors ${day.kcalGoalAchieved ? 'bg-kindra-100 border-teal-500/30 shadow-sm shadow-teal-500/5' : 'bg-kindra-200/30 border-kindra-300/30'}`}>
                                  <div className="flex items-center gap-2 text-xs font-bold text-kindra-400 uppercase tracking-widest mb-1.5">
                                    <Flame className="h-4 w-4" /> Kcal
                                  </div>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-display font-bold text-kindra-950">{Math.round(day.consumedKcal)}</span>
                                  </div>
                                </div>

                                <div className={`rounded-2xl p-3 border transition-colors ${day.proteinGoalAchieved ? 'bg-kindra-100 border-teal-500/20' : 'bg-kindra-200/30 border-kindra-300/30'}`}>
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-kindra-400 uppercase tracking-widest mb-1">
                                    <Beef className="h-3 w-3" /> Prot
                                  </div>
                                  <div className="flex items-baseline gap-0.5">
                                    <span className="text-base font-bold text-kindra-950">{Math.round(day.consumedProteinG)}</span>
                                    <span className="text-[10px] font-medium text-kindra-500">g</span>
                                  </div>
                                </div>

                                <div className={`rounded-2xl p-3 border transition-colors ${day.carbsGoalAchieved ? 'bg-kindra-100 border-teal-500/20' : 'bg-kindra-200/30 border-kindra-300/30'}`}>
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-kindra-400 uppercase tracking-widest mb-1">
                                    <Wheat className="h-3 w-3" /> Carb
                                  </div>
                                  <div className="flex items-baseline gap-0.5">
                                    <span className="text-base font-bold text-kindra-950">{Math.round(day.consumedCarbsG)}</span>
                                    <span className="text-[10px] font-medium text-kindra-500">g</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              </AreaWelcome>
            )}
          </>
        )}
      </div>
    </div>
  );
}
