import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ExerciseSelector } from '../components/workout/live/ExerciseSelector';
import { createRoutineBuilderStore } from '../components/workout/routineBuilderState';
import './exercise-catalog.css';
import './workout-live.css';
import './routine-builder.css';

export function RoutineBuilder() {
  const { routineId } = useParams();
  return <RoutineEditor key={routineId ?? 'new'} routineId={routineId} />;
}
function RoutineEditor({ routineId }: { routineId?: string; key?: string }) {
  const navigate = useNavigate();
  const [store] = useState(() => createRoutineBuilderStore(routineId));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [selector, setSelector] = useState(false);
  const mounted = useRef(true);
  const frozen = state.pending || state.loading;
  useEffect(() => {
    mounted.current = true; void store.load();
    return () => { mounted.current = false; };
  }, [store]);
  useEffect(() => { if (state.authExpired) navigate('/login'); }, [state.authExpired, navigate]);
  useEffect(() => {
    // Same browser departure protection used by Workout Live, without local persistence.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = store.getSnapshot();
      if (current.dirty || current.pending) { event.preventDefault(); event.returnValue = ''; }
    };
    let index: number | undefined = window.history.state?.idx;
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return; }
      const next = event.state?.idx;
      const current = store.getSnapshot();
      if ((current.dirty || current.pending) && !window.confirm('Sair sem salvar as alterações da rotina?')) {
        if (typeof index === 'number' && typeof next === 'number' && index !== next) {
          restoring = true; window.history.go(index - next);
        }
      } else index = next;
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', pop, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.setTimeout(() => window.removeEventListener('popstate', pop, true), 0); };
  }, [store]);
  const leave = () => {
    if ((state.dirty || state.pending) && !window.confirm('Sair sem salvar as alterações da rotina?')) return;
    navigate('/workout');
  };
  return <main className="routine-builder">
    <header className="builder-heading"><Button variant="ghost" aria-label="Voltar aos treinos" onClick={leave} disabled={state.pending}><ChevronLeft size={22} /></Button>
      <h1>{routineId ? 'Editar rotina' : 'Criar rotina'}</h1></header>
    {state.loading && !state.ready && <p role="status">Carregando rotina...</p>}
    {!state.ready && state.error && <div role="alert" className="builder-error"><p>{state.error}</p><Button variant="outline" onClick={() => void store.load()}>Tentar novamente</Button></div>}
    {state.ready && <form onSubmit={async event => { event.preventDefault(); if (await store.save() && mounted.current) navigate('/workout'); }}>
      <Input title="Nome da rotina" name="routineName" value={state.name} maxLength={100} required disabled={frozen} onChange={event => store.setName(event.target.value)} />
      <div className="builder-section-heading"><h2>Exercícios</h2><span>{state.items.length}</span></div>
      {!state.items.length && <p className="builder-empty">Nenhum exercício adicionado ainda.</p>}
      <ol className="builder-items">{state.items.map((item, index) => <li className="builder-item" key={item.key} data-exercise-id={item.exercise.id}>
        <div className="builder-item-heading"><span className="builder-position">{index + 1}.</span><h3>{item.exercise.name}</h3>
          <div className="builder-item-actions">
            <Button type="button" variant="ghost" aria-label={`Mover ${item.exercise.name} para cima`} disabled={frozen || index === 0} onClick={() => store.move(item.key, -1)}><ArrowUp size={17} /></Button>
            <Button type="button" variant="ghost" aria-label={`Mover ${item.exercise.name} para baixo`} disabled={frozen || index === state.items.length - 1} onClick={() => store.move(item.key, 1)}><ArrowDown size={17} /></Button>
            <Button type="button" variant="ghost" aria-label={`Remover ${item.exercise.name}`} disabled={frozen} onClick={() => store.remove(item.key)}><Trash2 size={17} /></Button>
          </div>
        </div>
        {item.exercise.isActive === false && <p className="builder-error">Exercício indisponível. Remova-o ou substitua-o antes de salvar a lista.</p>}
        <div className="builder-item-fields"><Input title="Descanso (segundos)" aria-label={`Descanso de ${item.exercise.name}, item ${index + 1}`} inputMode="numeric" type="text" pattern="[0-9]*" placeholder="Não definido" value={item.restTime} disabled={frozen} onChange={event => store.edit(item.key, { restTime: event.target.value })} />
          <label className="builder-note">Nota<textarea aria-label={`Nota de ${item.exercise.name}, item ${index + 1}`} value={item.notes} rows={2} maxLength={500} placeholder="Opcional" disabled={frozen} onChange={event => store.edit(item.key, { notes: event.target.value })} /></label></div>
      </li>)}</ol>
      <Button className="builder-add" type="button" variant="outline" disabled={frozen} onClick={() => setSelector(true)}><Plus size={18} /> Adicionar exercício</Button>
      {state.error && <p role="alert" className="builder-error">{state.error}</p>}
      <div className="builder-save"><Button className="w-full" type="submit" isLoading={state.pending} disabled={state.loading || !state.name.trim()}>Salvar rotina</Button>
        <Button type="button" variant="ghost" onClick={leave} disabled={state.pending}>Cancelar</Button></div>
      {routineId && <Button className="builder-delete" type="button" variant="ghost" disabled={frozen} onClick={async () => {
        if (!window.confirm('Excluir esta rotina? Os dias da semana que a utilizam virarão descanso. O histórico de treinos será preservado.')) return;
        if (await store.removeRoutine() && mounted.current) navigate('/workout');
      }}><Trash2 size={16} /> Excluir rotina</Button>}
    </form>}
    {selector && <ExerciseSelector onClose={() => setSelector(false)} onAdd={async exercises => { store.add(exercises); return exercises.map(exercise => exercise.id); }} />}
  </main>;
}
