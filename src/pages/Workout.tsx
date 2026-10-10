import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Sheet } from '../components/ui/Sheet';
import { Plus, Play, Dumbbell, ArrowUpRight, ArrowRight, ChartNoAxesCombined, Moon, Pencil, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { createWeeklyTrainingStore } from '../components/workout/weeklyTrainingState';
import { localTrainingWeekday, trainingToday, trainingWeekdays, weekdayLabels, type TrainingWeekday } from '../shared/weeklyTraining';
import './weekly-training.css';
import { starterEquipment, type StarterTrainingInput } from '../shared/starterTraining';
import { equipmentLabels } from '../shared/activityOptions';

type Editor = { kind: 'create' } | { kind: 'generate' } | { kind: 'rename'; planId: string } | { kind: 'day'; planId: string; day: TrainingWeekday };
const guardianWorkout = new URL('../assets/workout/guardian-double-biceps.png', import.meta.url).href;
const seenWelcomeInMemory = new Set<string>();
const welcomeKey = (userId: string | null) => `kindra:workout-welcome:v1:${userId || 'session'}`;

function hasSeenWelcome(userId: string | null) {
  const key = welcomeKey(userId);
  if (seenWelcomeInMemory.has(key)) return true;
  if (!userId) return false;
  try { return window.localStorage.getItem(key) === 'seen'; }
  catch { return false; }
}

export function Workout() {
  const navigate = useNavigate();
  const [store] = useState(createWeeklyTrainingStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [routineId, setRoutineId] = useState('');
  const [trainingDays, setTrainingDays] = useState<StarterTrainingInput['trainingDaysPerWeek'] | ''>('');
  const [equipment, setEquipment] = useState<StarterTrainingInput['equipment']>([]);
  const [today, setToday] = useState(() => new Date());
  const [welcome, setWelcome] = useState<{ userId: string | null; open: boolean } | null>(null);
  useEffect(() => { void store.load(); }, [store]);
  useEffect(() => { if (state.authExpired) navigate('/login'); }, [state.authExpired, navigate]);
  useEffect(() => {
    let mounted = true;
    void apiFetch('/auth/me').then((user: { id?: string }) => {
      if (!mounted) return;
      const userId = typeof user.id === 'string' ? user.id : null;
      setWelcome({ userId, open: !hasSeenWelcome(userId) });
    }).catch((error: { status?: number }) => {
      if (mounted && error.status !== 401 && error.status !== 403) setWelcome({ userId: null, open: true });
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const refresh = () => setToday(new Date());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const selected = state.plans.find(plan => plan.id === state.selectedId);
  const active = state.plans.find(plan => plan.isActive) ?? null;
  const day = trainingToday(active, today);
  const weekday = localTrainingWeekday(today);
  const error = state.error && (!state.errorPlanId || state.errorPlanId === state.selectedId) ? state.error : '';
  const close = () => { if (editor?.kind !== 'generate' || !state.pending) setEditor(null); };
  const openCreate = () => { setName(''); setEditor({ kind: 'create' }); };
  const dismissWelcome = () => setWelcome(current => current ? { ...current, open: false } : current);
  const chooseWelcome = (kind: 'create' | 'generate') => {
    if (!welcome) return;
    const key = welcomeKey(welcome.userId);
    seenWelcomeInMemory.add(key);
    if (welcome.userId) {
      try { window.localStorage.setItem(key, 'seen'); }
      catch { /* Visual preference remains in memory for this session. */ }
    }
    dismissWelcome();
    if (kind === 'generate') setEditor({ kind: 'generate' });
    else openCreate();
  };
  const save = async () => {
    if (!editor) return;
    const target = editor;
    if (target.kind === 'generate' && (!trainingDays || !equipment.length)) return;
    const success = target.kind === 'generate' ? await store.generate({ trainingDaysPerWeek: trainingDays as StarterTrainingInput['trainingDaysPerWeek'], equipment })
      : target.kind === 'create' ? await store.create(name.trim())
      : target.kind === 'rename' ? await store.rename(target.planId, name.trim())
      : routineId ? await store.setDay(target.planId, target.day, routineId) : await store.removeDay(target.planId, target.day);
    if (success) setEditor(current => current === target ? null : current);
  };
  return <div className="page-container weekly-page">
    <header className="weekly-heading"><h1>Treinos</h1><p>Organize sua semana e encontre o próximo treino.</p></header>
    {!editor && error && <div role="alert" className="weekly-error">{error} <Button variant="ghost" onClick={() => void store.load()} disabled={state.pending || state.loading}>Tentar novamente</Button></div>}
    {!state.loaded && state.loading && <p role="status">Carregando sua semana...</p>}
    {state.loaded && <>
      <div className="weekly-overview">
      {active ? <section className={`weekly-today${day ? '' : ' weekly-today-rest'}`} aria-label="Treino de hoje">
        <img className="weekly-guardian" src={guardianWorkout} alt="" aria-hidden="true" width="1254" height="1254" decoding="async" />
        <div className="weekly-today-copy">
        <p className="weekly-context">Hoje <span>{weekdayLabels[weekday].full}</span></p>
        <p className="weekly-next-label">{day ? 'Seu treino de hoje' : 'Na sua semana'}</p>
        <h2>{day ? day.routine.name : 'Hoje é descanso'}</h2>
        {day ? <p className="weekly-today-detail">{day.routine.exerciseCount === 0 ? 'Rotina sem exercícios' : <><strong>{day.routine.exerciseCount}</strong> {day.routine.exerciseCount === 1 ? 'exercício' : 'exercícios'} nesta rotina</>}</p> : <p className="weekly-today-detail">Nenhuma rotina programada para hoje. Consulte os outros dias na sua agenda.</p>}
        <p className="weekly-active-source">Plano em uso<strong>{active.name}</strong></p>
        {day && <Button isLoading={state.pending} onClick={async () => { if (await store.start(day.routineId)) navigate('/workout/live'); }}><Play size={16} aria-hidden="true" /> Iniciar treino</Button>}
        </div>
      </section> : <section className="weekly-today weekly-today-empty" aria-label="Treino de hoje"><p className="weekly-context">Hoje</p><p className="weekly-next-label">Seu treino de hoje</p><h2>Sem plano em uso</h2><p className="weekly-today-detail">{state.plans.length ? 'Ative um plano abaixo para definir o treino de hoje.' : 'Crie uma base inicial para organizar sua semana de treino.'}</p></section>}
      <section aria-label="Minha Semana" className="weekly-section">
        <div className="weekly-section-heading"><div><h2>Minha semana</h2><p>Distribua suas rotinas pelos dias da semana.</p></div>{state.plans.length > 0 && <Button className="weekly-new-plan" variant="ghost" size="sm" onClick={openCreate} disabled={state.pending}><Plus size={16} aria-hidden="true" /> Novo plano</Button>}</div>
        {!state.plans.length ? <div className="weekly-empty"><p>Organize sua semana de treino</p><p className="text-kindra-500">Crie uma base inicial. Você pode editar tudo depois.</p><div className="weekly-empty-actions"><Button variant="outline" onClick={openCreate}>Montar manualmente</Button><Button onClick={() => setEditor({ kind: 'generate' })}>Criar uma base para mim</Button></div></div> : selected && <>
          <div className="weekly-plan-heading">
            <label className="weekly-plan-select"><span className="sr-only">Plano que você está visualizando</span><select aria-label="Plano semanal" value={selected.id} onChange={event => { store.select(event.target.value); close(); }}>{state.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <Button variant="ghost" aria-label="Renomear plano" disabled={state.pending} onClick={() => { setName(selected.name); setEditor({ kind: 'rename', planId: selected.id }); }}><Pencil size={17} /></Button>
          </div>
          <div className="weekly-plan-status"><div><p className={selected.isActive ? 'weekly-in-use' : undefined}>{selected.isActive ? 'Este plano está em uso' : 'Este plano não está em uso'} <span>· {selected.source === 'GENERATED' ? 'Base gerada' : 'Personalizado'}</span></p>
            {!selected.isActive && <p>{active ? <>O treino de hoje segue o plano <strong>{active.name}</strong>.</> : 'Ative um plano para definir o treino de cada dia.'}</p>}</div>
            {!selected.isActive && <Button size="sm" variant="outline" disabled={state.pending} onClick={() => void store.activate(selected.id)}>Ativar plano</Button>}
          </div>
          <ol className="weekly-days">{trainingWeekdays.map(key => {
            const assigned = selected.days.find(item => item.dayOfWeek === key);
            return <li key={key}><button className={`weekly-day${assigned ? assigned.routine.exerciseCount === 0 ? ' weekly-day-empty' : ' weekly-day-planned' : ' weekly-day-rest'}${key === weekday ? ' weekly-day-today' : ''}`} data-weekday={key} disabled={state.pending} aria-label={`Editar ${weekdayLabels[key].full}`} onClick={() => { setRoutineId(assigned?.routineId ?? ''); setEditor({ kind: 'day', planId: selected.id, day: key }); }}>
              <span className={`weekly-day-label ${key === weekday ? 'weekly-current-day' : ''}`}>{weekdayLabels[key].short}</span>
              {assigned ? <Dumbbell className="weekly-day-icon" aria-hidden="true" /> : <Moon className="weekly-day-icon" aria-hidden="true" />}
              <span className="weekly-day-content"><strong title={assigned?.routine.name ?? 'Descanso'}>{assigned?.routine.name ?? 'Descanso'}</strong>{assigned && <small title={`${assigned.routine.exerciseCount} ${assigned.routine.exerciseCount === 1 ? 'exercício' : 'exercícios'}`}>{assigned.routine.exerciseCount} ex.</small>}</span>
              {key === weekday && <span className="weekly-today-chip">Hoje</span>}
            </button></li>;
          })}</ol>
          <p className="weekly-edit-hint">Selecione um dia para ajustar sua semana.</p>
        </>}
      </section>
      </div>
      <section aria-label="Minhas rotinas" className="weekly-routines">
        <div className="weekly-section-heading"><div><h2>Minhas rotinas</h2><p>Listas de exercícios para usar nos seus treinos.</p></div><Button className="weekly-new-routine" variant="ghost" size="sm" onClick={() => navigate('/routines/new')}><Plus size={15} aria-hidden="true" /> Criar rotina</Button></div>
        {state.routines.length ? <div className="weekly-routine-list">{state.routines.map(routine => <div key={routine.id} className={`weekly-routine-row${routine.exerciseCount === 0 ? ' weekly-routine-empty' : ''}`}>
          <button className="weekly-routine" aria-label={`Abrir treino: ${routine.name}`} onClick={() => navigate(`/workout/live?routineId=${routine.id}`)}>
            <span className="weekly-routine-icon"><Dumbbell size={19} aria-hidden="true" /></span>
            <span className="weekly-routine-copy"><strong>{routine.name}</strong><small>{routine.exerciseCount === 0 ? 'Sem exercícios · pronta para organizar' : `${routine.exerciseCount} ${routine.exerciseCount === 1 ? 'exercício' : 'exercícios'}`}</small></span>
            <ArrowRight className="weekly-routine-arrow" size={18} aria-hidden="true" />
          </button>
          <Button variant="ghost" size="sm" aria-label={`Editar ${routine.name}`} onClick={() => navigate(`/routines/${routine.id}/edit`)}><Pencil size={15} aria-hidden="true" /> <span className="weekly-edit-label">Editar rotina</span></Button>
        </div>)}</div> : <p className="weekly-empty-copy">Você ainda não tem rotinas. Crie uma lista de exercícios para usar na sua semana.</p>}
      </section>
      <section className="weekly-quick-links" aria-label="Outras formas de treinar">
        <div className="weekly-free"><span className="weekly-quick-icon"><Play size={22} aria-hidden="true" /></span><div><h3>Treino livre</h3><p>Treine sem seguir um plano fixo.</p></div><Button variant="ghost" size="sm" onClick={() => navigate('/workout/live')}><ArrowRight size={19} aria-hidden="true" /><span className="sr-only">Treino livre</span></Button></div>
        <Link to="/workout/exercises" className="weekly-catalog"><span className="weekly-quick-icon"><Dumbbell size={22} aria-hidden="true" /></span><div><h3>Explore os exercícios</h3><p>Busque por nome ou grupo muscular.</p></div><ArrowRight size={19} aria-hidden="true" /></Link>
      </section>
      <Link to="/workout/progress" className="weekly-evolution-entry"><span className="weekly-evolution-icon"><ChartNoAxesCombined size={23} aria-hidden="true" /></span><span className="weekly-evolution-copy-wrap"><span className="weekly-evolution-kicker">Acompanhe seu caminho</span><span className="weekly-evolution-title">Sua evolução</span><span className="weekly-evolution-copy">Veja a força, o volume e as marcas que você construiu nos seus treinos.</span></span><ArrowRight className="weekly-evolution-arrow" size={19} aria-hidden="true" /></Link>
    </>}
    <Sheet open={Boolean(editor)} onClose={close} label={editor?.kind === 'generate' ? 'Criar base inicial' : editor?.kind === 'day' ? `Editar ${weekdayLabels[editor.day].full}` : editor?.kind === 'rename' ? 'Renomear plano' : 'Criar plano'}>
      {editor && <form className="weekly-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="weekly-editor-heading"><h2>{editor.kind === 'generate' ? 'Criar base inicial' : editor.kind === 'day' ? weekdayLabels[editor.day].full : editor.kind === 'rename' ? 'Renomear plano' : 'Criar plano'}</h2><Button type="button" variant="ghost" aria-label="Fechar" disabled={editor.kind === 'generate' && state.pending} onClick={close}><X size={20} /></Button></div>
        {editor.kind === 'generate' ? <>
          <p className="text-kindra-500">Uma base geral de musculação, sem ajuste por objetivo ou experiência. Você pode editar tudo depois.</p>
          <label className="weekly-field">Quantos dias você quer treinar por semana?<select autoFocus aria-label="Dias por semana" value={trainingDays} onChange={event => setTrainingDays(event.target.value ? Number(event.target.value) as StarterTrainingInput['trainingDaysPerWeek'] : '')} disabled={state.pending} required><option value="">Selecione</option>{[2, 3, 4].map(days => <option key={days} value={days}>{days} dias</option>)}</select></label>
          <fieldset disabled={state.pending}><legend>Quais equipamentos você tem disponíveis?</legend><div className="weekly-equipment">{starterEquipment.map(value => <label key={value}><input type="checkbox" value={value} checked={equipment.includes(value)} onChange={event => setEquipment(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{equipmentLabels[value]}</label>)}</div></fieldset>
          {state.pending && <p role="status">Criando sua base inicial...</p>}
        </> : editor.kind === 'day' ? <><p className="weekly-editor-context">Escolha uma rotina para este dia no plano <strong>{selected?.name}</strong>, ou deixe como descanso.</p><label className="weekly-field">Treino do dia<select aria-label="Treino do dia" value={routineId} onChange={event => setRoutineId(event.target.value)} disabled={state.pending}><option value="">Descanso</option>{state.routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name} · {routine.exerciseCount} exercícios</option>)}</select></label>
          {!state.routines.length && <p className="text-kindra-500">Nenhuma rotina cadastrada para associar.</p>}
        </> : <label className="weekly-field">Nome do plano<Input autoFocus aria-label="Nome do plano" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={state.pending} /></label>}
        {error && <p role="alert" className="weekly-error">{error}</p>}
        <Button className="w-full" type="submit" isLoading={state.pending} disabled={editor.kind === 'generate' ? !trainingDays || !equipment.length : editor.kind !== 'day' && !name.trim()}>{editor.kind === 'generate' ? 'Criar base inicial' : 'Salvar alterações'}</Button>
        {editor.kind === 'day' && selected?.days.some(item => item.dayOfWeek === editor.day) && <Button className="w-full" type="button" variant="ghost" disabled={state.pending} onClick={async () => { const target = editor; if (await store.removeDay(target.planId, target.day)) setEditor(current => current === target ? null : current); }}>Remover treino do dia</Button>}
      </form>}
    </Sheet>
    <Sheet open={Boolean(welcome?.open && state.loaded && !editor)} onClose={dismissWelcome} label="Como você quer começar?">
      <div className="weekly-welcome">
        <div className="weekly-welcome-top"><span className="eyebrow">Bem-vindo aos treinos</span><button type="button" aria-label="Fechar apresentação" onClick={dismissWelcome}><X size={20} aria-hidden="true" /></button></div>
        <h2>Como você quer começar?</h2>
        <p>Escolha uma forma de organizar sua primeira semana. Você pode ajustar tudo depois.</p>
        <div className="weekly-welcome-choices">
          <button type="button" onClick={() => chooseWelcome('generate')}><span className="weekly-welcome-choice-icon"><Dumbbell size={22} aria-hidden="true" /></span><span><strong>Criar uma base para mim</strong><small>Escolha seus dias e equipamentos. O Kindra monta uma base inicial.</small></span><ArrowRight size={19} aria-hidden="true" /></button>
          <button type="button" onClick={() => chooseWelcome('create')}><span className="weekly-welcome-choice-icon"><Pencil size={21} aria-hidden="true" /></span><span><strong>Montar manualmente</strong><small>Crie seu próprio plano e organize a semana do seu jeito.</small></span><ArrowRight size={19} aria-hidden="true" /></button>
        </div>
        <button type="button" className="weekly-welcome-later" onClick={dismissWelcome}>Agora não</button>
      </div>
    </Sheet>
  </div>;
}
