import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { NutritionOverview } from '../components/nutri/NutritionOverview';
import { WaterTracker } from '../components/nutri/WaterTracker';
import { WeightTracker } from '../components/nutri/WeightTracker';
import { Card } from '../components/ui/Card';
import { StreakPanel } from '../components/nutri/StreakPanel';
import { AreaWelcome } from '../components/nutri/AreaWelcome';
import './nutri.css';
import { ArrowRight, ArrowUpRight, Target, Calendar, Droplet, Beef, Wheat, Flame } from 'lucide-react';
import * as nutritionApi from '../lib/nutrition';
import { calculateConsumedTotals, calculateWaterTotal } from '../lib/nutritionTotals';
import type { NutritionGoal, WaterIntakeLog, WeightLog, NutritionHistoryResponse, Meal } from '../lib/nutrition';

export function Nutri() {
  const recordsGuardian = new URL('../assets/nutri/guardian-records.png', import.meta.url).href;
  const [activeTab, setActiveTab] = useState<'diario' | 'hidratacao'>('diario');
  const [goal, setGoal] = useState<NutritionGoal | null>(null);
  const [waterLogs, setWaterLogs] = useState<WaterIntakeLog[]>([]);
  const [streakData, setStreakData] = useState<NutritionHistoryResponse | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isAddingWater, setIsAddingWater] = useState(false);
  const [removingWaterId, setRemovingWaterId] = useState<string | null>(null);
  const [isRefreshingWater, setIsRefreshingWater] = useState(false);
  const [waterError, setWaterError] = useState('');
  const [waterNotice, setWaterNotice] = useState('');
  const waterBusy = useRef(false);

  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [isWeightLoading, setIsWeightLoading] = useState(true);
  const [weightLoadError, setWeightLoadError] = useState('');
  const [weightActionError, setWeightActionError] = useState('');
  const [isAddingWeight, setIsAddingWeight] = useState(false);

  const loadWeightLogs = async () => {
    setWeightLoadError('');
    setIsWeightLoading(true);
    try {
      setWeightLogs(await nutritionApi.getWeightLogs());
    } catch (error) {
      console.error('Failed to fetch weight logs:', error);
      setWeightLoadError('Não foi possível carregar seus registros de peso. Tente novamente.');
    } finally {
      setIsWeightLoading(false);
    }
  };

  useEffect(() => {
    void loadWeightLogs();
  }, []);

  const handleAddWeight = async (kg: number) => {
    setIsAddingWeight(true);
    setWeightActionError('');
    try {
      const newLog = await nutritionApi.addWeightLog(kg);
      setWeightLogs([newLog, ...weightLogs]);
    } catch (error) {
      console.error('Failed to add weight:', error);
      setWeightActionError('Não foi possível registrar o peso. Tente novamente.');
    } finally {
      setIsAddingWeight(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoadError('');
    try {
      const [currentGoal, water, historyRes, mealsData] = await Promise.all([
        nutritionApi.getCurrentGoal(),
        nutritionApi.getWaterLogs(),
        nutritionApi.consolidateNutritionHistory(),
        nutritionApi.getMeals()
      ]);

      setGoal(currentGoal);
      setWaterLogs(water);
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

  const consumedTotals = calculateConsumedTotals(meals);
  const foodCount = meals.reduce((count, meal) => count + meal.entries.length, 0);

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

  const currentWaterMl = calculateWaterTotal(waterLogs);
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
    <div className={`page-container nutri-page nutri-overview-page${activeTab === 'hidratacao' ? ' nutri-hydration-view' : ''}`}>
      <div className="w-full">
        <div className="nutri-topbar">
          <div className="page-heading">
            <div>
              <h1 className="text-kindra-950">{activeTab === 'hidratacao' ? 'Hidratação' : 'Nutrição'}</h1>
              <p className="text-sm font-medium text-kindra-500 mt-1">Pequenos hábitos. Todos os dias.</p>
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
            }}>{tab === 'diario' ? 'Nutrição' : 'Hidratação'}</button>)}
          </div>
        </div>

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
                <>
                  <NutritionOverview goal={goal} consumed={consumedTotals} />
                  <StreakPanel streak={streakData?.currentStreak || 0} history={streakData?.history || []} todayAchieved={todayAchieved} />
                  <Link to="/nutri/registros" className="nutri-records-link" aria-label="Abrir meus registros alimentares">
                    <div className="nutri-records-copy">
                      <span className="eyebrow">Alimentação · hoje</span>
                      <h2>Registre seus alimentos aqui.</h2>
                      <p>{foodCount} {foodCount === 1 ? 'alimento registrado' : 'alimentos registrados'} hoje. Adicione o próximo.</p>
                      <span className="nutri-records-action">Ir para registros de alimentos <ArrowUpRight size={18} aria-hidden="true" /></span>
                    </div>
                    <img src={recordsGuardian} width="1254" height="1254" loading="lazy" decoding="async" alt="" aria-hidden="true" />
                  </Link>
                  <div className="nutrition-utilities">
                    <Card className="nutrition-settings-card">
                      <div className="flex items-start gap-4">
                        <div className="nutrition-utility-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-kindra-200 text-teal-300"><Target className="h-6 w-6" aria-hidden="true" /></div>
                        <div>
                          <h2 className="text-xl font-display font-semibold text-kindra-950">Metas nutricionais</h2>
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-kindra-500">Mantenha suas metas atualizadas.</p>
                      <Link to="/settings/nutrition" className="kindra-button button-primary nutrition-utility-action">Editar metas<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </Card>
                    <section className="nutrition-weight-section" aria-label="Acompanhamento do peso">
                      {weightActionError && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-400">{weightActionError}</p>}
                      {weightLoadError ? (
                        <Card className="p-6 text-center">
                          <p role="alert" className="mb-4 text-sm text-kindra-600">{weightLoadError}</p>
                          <button type="button" onClick={loadWeightLogs} className="kindra-button button-outline">Tentar novamente</button>
                        </Card>
                      ) : isWeightLoading ? (
                        <Card className="h-48 animate-pulse" aria-label="Carregando peso" />
                      ) : (
                        <WeightTracker logs={weightLogs} onAddWeight={handleAddWeight} isAdding={isAddingWeight} />
                      )}
                    </section>
                  </div>
                </>
              </AreaWelcome>
            )}

            {activeTab === 'hidratacao' && (
              <AreaWelcome area="hidratacao" userId={goal?.userId}>
              <>
              <StreakPanel streak={streakData?.currentStreak || 0} history={streakData?.history || []} todayAchieved={todayAchieved} heading="Sua consistência na hidratação" />
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

                <section className="nutrition-history" aria-labelledby="nutrition-history-heading">
                  <div className="nutrition-history-heading">
                    <h3 id="nutrition-history-heading">Histórico diário</h3>
                    <p>Seu progresso de nutrição e hidratação juntos.</p>
                  </div>
                  {(!streakData?.history || streakData.history.length === 0) ? (
                    <div className="nutrition-history-empty">
                      <Calendar aria-hidden="true" />
                      <div>
                        <h4>Nenhum registro</h4>
                        <p>Seus dados diários aparecerão aqui automaticamente após a meia-noite.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="nutrition-history-list">
                      {streakData.history.map((day) => {
                        const dateObj = new Date(day.date);
                        const dateStr = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
                        const allAchieved = day.waterGoalAchieved && day.kcalGoalAchieved && day.proteinGoalAchieved && day.carbsGoalAchieved && day.fatGoalAchieved;

                        return (
                          <article key={day.id} className="nutrition-history-day">
                            <div className="nutrition-history-day-head">
                              <time dateTime={day.date}>{dateStr}</time>
                              <span className={`nutrition-history-status${allAchieved ? ' is-complete' : ''}`}>{allAchieved ? 'Perfeito' : 'Incompleto'}</span>
                            </div>
                            <div className="nutrition-history-metrics">
                              <div className="nutrition-history-metric nutrition-history-water">
                                <Droplet aria-hidden="true" />
                                <div><strong>{day.waterIngestedMl} <small>ml</small></strong><span>de {day.targetWaterMl} ml</span></div>
                              </div>
                              <div className="nutrition-history-metric nutrition-history-kcal">
                                <Flame aria-hidden="true" />
                                <div><strong>{Math.round(day.consumedKcal)}</strong><span>kcal</span></div>
                              </div>
                              <div className="nutrition-history-metric nutrition-history-protein">
                                <Beef aria-hidden="true" />
                                <div><strong>{Math.round(day.consumedProteinG)} <small>g</small></strong><span>proteínas</span></div>
                              </div>
                              <div className="nutrition-history-metric nutrition-history-carbs">
                                <Wheat aria-hidden="true" />
                                <div><strong>{Math.round(day.consumedCarbsG)} <small>g</small></strong><span>carboidratos</span></div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
              </>
              </AreaWelcome>
            )}
          </>
        )}
      </div>
    </div>
  );
}
