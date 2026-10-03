import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, ArrowUpRight, Droplet, Dumbbell, Flame, LogOut, RefreshCw, Utensils } from 'lucide-react';
import { apiFetch } from '../lib/api';
import * as nutritionApi from '../lib/nutrition';
import type { Meal, NutritionGoal, NutritionHistoryResponse, WaterIntakeLog } from '../lib/nutrition';
import { calculateConsumedTotals, calculateWaterTotal } from '../lib/nutritionTotals';
import { localTrainingWeekday, trainingToday, weekdayLabels, type WeeklyTrainingPlan } from '../shared/weeklyTraining';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import './home.css';

type Status = 'loading' | 'available' | 'empty' | 'error';
interface Section<T> { status: Status; data: T | null; }
const initial = <T,>(): Section<T> => ({ status: 'loading', data: null });

export function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [authStatus, setAuthStatus] = useState<Status>('loading');
  const [goal, setGoal] = useState<Section<NutritionGoal>>(() => initial());
  const [streak, setStreak] = useState<Section<NutritionHistoryResponse>>(() => initial());
  const [meals, setMeals] = useState<Section<Meal[]>>(() => initial());
  const [water, setWater] = useState<Section<WaterIntakeLog[]>>(() => initial());
  const [plan, setPlan] = useState<Section<WeeklyTrainingPlan>>(() => initial());

  const loadAuth = useCallback(async () => {
    setAuthStatus('loading');
    try {
      const userData = await apiFetch('/auth/me');
      if (!userData.hasProfile) { navigate('/onboarding'); return; }
      setUser(userData);
      setAuthStatus('available');
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) navigate('/login');
      else setAuthStatus('error');
    }
  }, [navigate]);

  useEffect(() => { void loadAuth(); }, [loadAuth]);

  useEffect(() => {
    if (authStatus !== 'available') return;
    let current = true;
    const guarded = async <T,>(load: () => Promise<T>, set: (value: Section<T>) => void, isEmpty: (value: T) => boolean = () => false) => {
      try {
        const data = await load();
        if (current) set({ status: isEmpty(data) ? 'empty' : 'available', data });
      } catch (error: any) {
        if (error?.status === 401 || error?.status === 403) navigate('/login');
        else if (current) set({ status: 'error', data: null });
      }
    };

    void guarded(() => nutritionApi.getCurrentGoal(), setGoal, data => data === null);
    void guarded(() => nutritionApi.consolidateNutritionHistory(), setStreak);
    void guarded(() => nutritionApi.getMeals(), setMeals, data => data.length === 0);
    void guarded(() => nutritionApi.getWaterLogs(), setWater, data => data.length === 0);
    void guarded(() => apiFetch('/workouts/plans/active'), setPlan, data => data === null);
    return () => { current = false; };
  }, [authStatus, navigate]);

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { data: {} }); navigate('/login'); }
    catch (error) { console.error(error); }
  };

  if (authStatus === 'loading') return <div className="home-loading" role="status"><RefreshCw aria-hidden="true" /> Carregando seu dia…</div>;
  if (authStatus === 'error') return <div className="home-auth-error"><Card><AlertCircle aria-hidden="true" /><h2>Não foi possível abrir sua Home</h2><p>Tente carregar novamente.</p><Button onClick={() => void loadAuth()}>Tentar novamente</Button></Card></div>;

  const profile = user?.profile;
  const today = localTrainingWeekday();
  const todayPlan = plan.data ? trainingToday(plan.data) : null;
  const mealsValue = meals.data ? calculateConsumedTotals(meals.data) : null;
  const waterValue = water.data ? calculateWaterTotal(water.data) : null;
  const waterTarget = goal.data?.targetWaterMl ?? null;

  return <main className="page-container home-page">
    <header className="home-heading">
      <div><span className="eyebrow">Seu espaço</span><h1>Olá, {profile?.firstName}.</h1><p>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}. Vamos cuidar do seu dia?</p></div>
      <button onClick={handleLogout} className="icon-button" aria-label="Sair da conta"><LogOut size={18} /></button>
    </header>

    <section className="home-streak" aria-labelledby="home-streak-title">
      <div className="home-streak-main">
        <span className="eyebrow">Consistência nutricional</span>
        <h2 id="home-streak-title">Sua ofensiva.</h2>
        {streak.status === 'loading' && <p className="home-section-status" role="status">Atualizando sua constância…</p>}
        {streak.status === 'error' && <div className="home-inline-error" role="alert"><p>Não foi possível carregar sua ofensiva.</p><Button variant="outline" size="sm" onClick={() => window.location.reload()}>Tentar novamente</Button></div>}
        {streak.data && <div className="home-streak-count"><strong>{streak.data.currentStreak}</strong><span>dias<br />consecutivos</span></div>}
        {streak.status === 'available' && <p className="home-streak-copy">Dias consolidados conforme suas metas de alimentação e água.</p>}
        {goal.status === 'empty' && <p className="home-streak-note">Defina uma meta nutricional para acompanhar as metas que compõem sua ofensiva.</p>}
        {goal.status === 'error' && <p className="home-streak-note" role="status">Não foi possível atualizar a meta nutricional agora.</p>}
        <Link to="/nutri" className="home-text-link">Acompanhar nutrição <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
      <div className="home-streak-mark" aria-hidden="true"><Flame /></div>
    </section>

    <section className="home-today" aria-labelledby="home-today-title">
      <div className="home-section-heading"><div><span className="eyebrow">{weekdayLabels[today].full}</span><h2 id="home-today-title">Treino de hoje</h2></div><Dumbbell aria-hidden="true" /></div>
      {plan.status === 'loading' && <p className="home-section-status" role="status">Buscando seu plano…</p>}
      {plan.status === 'error' && <p className="home-section-status" role="alert">Não foi possível carregar o treino de hoje.</p>}
      {plan.status === 'empty' && <div className="home-plan-message"><p>Você ainda não tem um plano semanal ativo.</p><Link to="/workout">Organizar meus treinos <ArrowUpRight size={16} aria-hidden="true" /></Link></div>}
      {plan.status === 'available' && (todayPlan
        ? <div className="home-plan-message"><h3>{todayPlan.routine.name}</h3><p>{todayPlan.routine.exerciseCount === 0 ? 'Rotina sem exercícios' : `${todayPlan.routine.exerciseCount} ${todayPlan.routine.exerciseCount === 1 ? 'exercício' : 'exercícios'} planejados`}</p><Link to="/workout">Ver treino de hoje <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        : <div className="home-plan-message"><h3>Hoje é dia de descanso</h3><p>Seu plano semanal não tem treino previsto para hoje.</p><Link to="/workout">Ver minha semana <ArrowUpRight size={16} aria-hidden="true" /></Link></div>)}
    </section>

    <div className="home-daily-grid">
      <section className="home-daily-section" aria-labelledby="home-food-title">
        <div className="home-section-heading"><div><span className="eyebrow">Alimentação</span><h2 id="home-food-title">Resumo do dia</h2></div><Utensils aria-hidden="true" /></div>
        {meals.status === 'loading' && <p className="home-section-status" role="status">Carregando refeições…</p>}
        {meals.status === 'error' && <p className="home-section-status" role="alert">Não foi possível carregar suas refeições.</p>}
        {meals.data && <><div className="home-food-kcal"><strong>{mealsValue!.kcal.toFixed(0)}</strong><span>kcal consumidas</span></div><p className="home-daily-caption">{meals.data.length === 0 ? 'Nenhuma refeição registrada hoje.' : `${meals.data.reduce((count, meal) => count + meal.entries.length, 0)} alimentos registrados hoje.`}</p><div className="home-macros"><span>Proteínas <strong>{mealsValue!.proteinG.toFixed(0)} g</strong></span><span>Carboidratos <strong>{mealsValue!.carbsG.toFixed(0)} g</strong></span><span>Gorduras <strong>{mealsValue!.fatG.toFixed(0)} g</strong></span></div>{goal.data && <p className="home-target-note">Meta diária: {goal.data.targetKcal.toFixed(0)} kcal</p>}</>}
        {goal.status === 'empty' && <p className="home-target-note">Meta diária indisponível.</p>}
        <Link to="/nutri" className="home-text-link">Abrir diário <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <section className="home-daily-section home-water-section" aria-labelledby="home-water-title">
        <div className="home-section-heading"><div><span className="eyebrow">Hidratação</span><h2 id="home-water-title">Água hoje</h2></div><Droplet aria-hidden="true" /></div>
        {water.status === 'loading' && <p className="home-section-status" role="status">Carregando registros…</p>}
        {water.status === 'error' && <p className="home-section-status" role="alert">Não foi possível carregar sua hidratação.</p>}
        {water.data && <><div className="home-water-total"><strong>{waterValue}</strong><span>ml registrados</span></div><p className="home-daily-caption">{water.data.length === 0 ? 'Nenhuma água registrada hoje.' : `${water.data.length} ${water.data.length === 1 ? 'registro' : 'registros'} hoje.`}</p>{waterTarget !== null && <p className="home-target-note">Meta diária: {waterTarget} ml</p>}</>}
        {water.status === 'empty' && waterTarget === null && <p className="home-target-note">Meta de água indisponível.</p>}
        <Link to="/nutri" className="home-text-link">Registrar água <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </div>
  </main>;
}
