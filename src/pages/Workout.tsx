import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Sheet } from '../components/ui/Sheet';
import { Plus, Play, Dumbbell, ArrowUpRight, Pencil, X } from 'lucide-react';
import { createWeeklyTrainingStore } from '../components/workout/weeklyTrainingState';
import { localTrainingWeekday, trainingToday, trainingWeekdays, weekdayLabels, type TrainingWeekday } from '../shared/weeklyTraining';
import './weekly-training.css';
import { starterEquipment, type StarterTrainingInput } from '../shared/starterTraining';
import { equipmentLabels } from '../shared/activityOptions';

type Editor = { kind: 'create' } | { kind: 'generate' } | { kind: 'rename'; planId: string } | { kind: 'day'; planId: string; day: TrainingWeekday };

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
  useEffect(() => { void store.load(); }, [store]);
  useEffect(() => { if (state.authExpired) navigate('/login'); }, [state.authExpired, navigate]);
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
    <header className="page-heading"><div><span className="eyebrow">Movimento</span><h1 className="mt-2">Seus treinos.</h1></div><Dumbbell size={22} aria-hidden="true" /></header>
    {!editor && error && <div role="alert" className="weekly-error">{error} <Button variant="ghost" onClick={() => void store.load()} disabled={state.pending || state.loading}>Tentar novamente</Button></div>}
    {!state.loaded && state.loading && <p role="status">Carregando sua semana...</p>}
    {state.loaded && <>
      {active && <section className="weekly-today" aria-label="Treino de hoje">
        <p className="text-kindra-500">Hoje · {weekdayLabels[weekday].full}</p>
        <h2>{day ? day.routine.name : 'Hoje é descanso'}</h2>
        {day && <><p>{day.routine.exerciseCount} {day.routine.exerciseCount === 1 ? 'exercício' : 'exercícios'}</p>
          <Button isLoading={state.pending} onClick={async () => { if (await store.start(day.routineId)) navigate('/workout/live'); }}><Play size={16} /> Iniciar treino</Button></>}
      </section>}
      <section aria-label="Minha Semana" className="weekly-section">
        <div className="section-heading"><h2>Minha Semana</h2>{state.plans.length > 0 && <Button variant="ghost" size="sm" onClick={openCreate} disabled={state.pending}><Plus size={16} /> Novo plano</Button>}</div>
        {!state.plans.length ? <div className="weekly-empty"><p>Organize sua semana de treino</p><p className="text-kindra-500">Crie uma base inicial. Você pode editar tudo depois.</p><div className="weekly-empty-actions"><Button variant="outline" onClick={openCreate}>Montar manualmente</Button><Button onClick={() => setEditor({ kind: 'generate' })}>Criar uma base para mim</Button></div></div> : selected && <>
          <div className="weekly-plan-heading">
            <label className="weekly-plan-select">Plano<select aria-label="Plano semanal" value={selected.id} onChange={event => { store.select(event.target.value); close(); }}>{state.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}{plan.isActive ? ' · Ativo' : ''}</option>)}</select></label>
            <Button variant="ghost" aria-label="Renomear plano" disabled={state.pending} onClick={() => { setName(selected.name); setEditor({ kind: 'rename', planId: selected.id }); }}><Pencil size={17} /></Button>
          </div>
          <div className="weekly-plan-status"><span>{selected.isActive ? 'Plano ativo' : 'Plano inativo'} · {selected.source === 'GENERATED' ? 'Gerado' : 'Personalizado'}</span>
            {!selected.isActive && <Button size="sm" variant="outline" disabled={state.pending} onClick={() => void store.activate(selected.id)}>Ativar plano</Button>}
          </div>
          <ol className="weekly-days">{trainingWeekdays.map(key => {
            const assigned = selected.days.find(item => item.dayOfWeek === key);
            return <li key={key}><button className="weekly-day" data-weekday={key} disabled={state.pending} aria-label={`Editar ${weekdayLabels[key].full}`} onClick={() => { setRoutineId(assigned?.routineId ?? ''); setEditor({ kind: 'day', planId: selected.id, day: key }); }}>
              <span className={`weekly-day-label ${key === weekday ? 'weekly-current-day' : ''}`}><span>{weekdayLabels[key].short}</span>{key === weekday && <small>Hoje</small>}</span>
              <span className="weekly-day-content"><strong>{assigned?.routine.name ?? 'Descanso'}</strong>{assigned && <small>{assigned.routine.exerciseCount} {assigned.routine.exerciseCount === 1 ? 'exercício' : 'exercícios'}</small>}</span>
              <Pencil size={15} className="text-kindra-500 shrink-0" aria-hidden="true" />
            </button></li>;
          })}</ol>
        </>}
      </section>
      <section aria-label="Suas rotinas"><div className="section-heading"><h2>Suas rotinas</h2><Button variant="ghost" size="sm" onClick={() => navigate('/routines/new')}><Plus size={15} /> Criar rotina</Button></div><div className="mb-3"><Button variant="ghost" size="sm" onClick={() => navigate('/workout/live')}><Play size={15} /> Treino livre</Button></div>
        {state.routines.length ? <div className="grid gap-3 sm:grid-cols-2">{state.routines.map(routine => <div key={routine.id} className="kindra-card p-4"><button className="text-left weekly-routine w-full min-h-11" onClick={() => navigate(`/workout/live?routineId=${routine.id}`)}><span><strong>{routine.name}</strong><small>{routine.exerciseCount} {routine.exerciseCount === 1 ? 'exercício' : 'exercícios'}</small></span><ArrowUpRight size={18} className="shrink-0 text-teal-300" /></button><Button variant="ghost" size="sm" className="mt-2" aria-label={`Editar ${routine.name}`} onClick={() => navigate(`/routines/${routine.id}/edit`)}><Pencil size={15} /> Editar rotina</Button></div>)}</div> : <p className="text-kindra-500">Você ainda não tem rotinas cadastradas.</p>}
      </section>
      <Link to="/workout/exercises" className="routine-link mt-5"><Dumbbell size={20} /><div className="flex-1"><h3>Explore os exercícios</h3><p>Busque por nome ou grupo muscular.</p></div><ArrowUpRight size={17} /></Link>
    </>}
    <Sheet open={Boolean(editor)} onClose={close} label={editor?.kind === 'generate' ? 'Criar base inicial' : editor?.kind === 'day' ? `Editar ${weekdayLabels[editor.day].full}` : editor?.kind === 'rename' ? 'Renomear plano' : 'Criar plano'}>
      {editor && <form className="weekly-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="weekly-editor-heading"><h2>{editor.kind === 'generate' ? 'Criar base inicial' : editor.kind === 'day' ? weekdayLabels[editor.day].full : editor.kind === 'rename' ? 'Renomear plano' : 'Criar plano'}</h2><Button type="button" variant="ghost" aria-label="Fechar" disabled={editor.kind === 'generate' && state.pending} onClick={close}><X size={20} /></Button></div>
        {editor.kind === 'generate' ? <>
          <p className="text-kindra-500">Uma base geral de musculação, sem ajuste por objetivo ou experiência. Você pode editar tudo depois.</p>
          <label className="weekly-field">Quantos dias você quer treinar por semana?<select autoFocus aria-label="Dias por semana" value={trainingDays} onChange={event => setTrainingDays(event.target.value ? Number(event.target.value) as StarterTrainingInput['trainingDaysPerWeek'] : '')} disabled={state.pending} required><option value="">Selecione</option>{[2, 3, 4].map(days => <option key={days} value={days}>{days} dias</option>)}</select></label>
          <fieldset disabled={state.pending}><legend>Quais equipamentos você tem disponíveis?</legend><div className="weekly-equipment">{starterEquipment.map(value => <label key={value}><input type="checkbox" value={value} checked={equipment.includes(value)} onChange={event => setEquipment(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{equipmentLabels[value]}</label>)}</div></fieldset>
          {state.pending && <p role="status">Criando sua base inicial...</p>}
        </> : editor.kind === 'day' ? <><label className="weekly-field">Treino do dia<select aria-label="Treino do dia" value={routineId} onChange={event => setRoutineId(event.target.value)} disabled={state.pending}><option value="">Descanso</option>{state.routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name} · {routine.exerciseCount} exercícios</option>)}</select></label>
          {!state.routines.length && <p className="text-kindra-500">Nenhuma rotina cadastrada para associar.</p>}
        </> : <label className="weekly-field">Nome do plano<Input autoFocus aria-label="Nome do plano" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={state.pending} /></label>}
        {error && <p role="alert" className="weekly-error">{error}</p>}
        <Button className="w-full" type="submit" isLoading={state.pending} disabled={editor.kind === 'generate' ? !trainingDays || !equipment.length : editor.kind !== 'day' && !name.trim()}>{editor.kind === 'generate' ? 'Criar base inicial' : 'Salvar alterações'}</Button>
        {editor.kind === 'day' && selected?.days.some(item => item.dayOfWeek === editor.day) && <Button className="w-full" type="button" variant="ghost" disabled={state.pending} onClick={async () => { const target = editor; if (await store.removeDay(target.planId, target.day)) setEditor(current => current === target ? null : current); }}>Remover treino do dia</Button>}
      </form>}
    </Sheet>
  </div>;
}
