import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Timer, ChevronLeft, X, ListChecks, Trash2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Sheet } from '../components/ui/Sheet';
import { apiFetch } from '../lib/api';
import { LiveExerciseCard } from '../components/workout/live/LiveExerciseCard';
import { ExerciseSelector } from '../components/workout/live/ExerciseSelector';
import { WorkoutCompletionSummary } from '../components/workout/live/WorkoutCompletionSummary';
import { ExerciseThumbnail, MuscleVisual } from '../components/workout/ExerciseThumbnail';
import { muscleLabels, equipmentLabels } from '../shared/activityOptions';
import { useLiveWorkout } from '../components/workout/live/useLiveWorkout';
import { catalogSchema, elapsedSeconds, formatTime, summary, type LiveCatalogExercise } from '../components/workout/live/model';
import './exercise-catalog.css';
import './workout-live.css';

export function WorkoutLive() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const routineId = params.get('routineId');
  const { session, loading, unavailable, error, pending, dirty, store, previous, previousError, personalRecords, personalRecordsLoading, personalRecordsError } = useLiveWorkout();
  const [clock, setClock] = useState(Date.now());
  const [selector, setSelector] = useState(false);
  const [finish, setFinish] = useState(false);
  const [name, setName] = useState('Treino livre');
  const [catalog, setCatalog] = useState<LiveCatalogExercise[]>([]);
  const active = session?.status === 'ACTIVE';
  const ending = pending.includes('end');
  const frozen = !active || unavailable || loading || ending;
  const totals = useMemo(() => {
    try { return { ...summary(active ? session.exercises : []), error: '' }; }
    catch { return { volume: null, sets: null, warmups: 0, error: 'Não foi possível calcular o resumo visual deste treino.' }; }
  }, [session, active]);
  const elapsed = elapsedSeconds(session, clock);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/workouts/exercises', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setCatalog(catalogSchema.parse(data));
    }).catch(() => { /* Session snapshots and muscle fallback remain available. */ });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!active) return;
    const update = () => setClock(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(interval); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [active]);
  useEffect(() => { if (!active) { setSelector(false); setFinish(false); } }, [active]);
  const leave = () => {
    if (active && !window.confirm(dirty.length || pending.length
      ? 'Sair com edições não salvas? Apenas os dados já confirmados poderão ser recuperados.'
      : 'Sair do treino em andamento? Ele continuará salvo e poderá ser retomado.')) return;
    navigate('/workout');
  };
  const nextExerciseId = session?.exercises.find(exercise => exercise.sets.some(set => !set.completedAt))?.id;
  const currentIndex = session?.exercises.findIndex(exercise => exercise.id === nextExerciseId) ?? -1;
  const currentExercise = currentIndex >= 0 ? session?.exercises[currentIndex] : undefined;
  const orderedExercises = currentExercise
    ? [currentExercise, ...session!.exercises.filter(exercise => exercise.id !== currentExercise.id)]
    : session?.exercises ?? [];
  const upcomingExercises = currentIndex >= 0 ? session!.exercises.slice(currentIndex + 1) : [];
  const endSession = async (action: 'finish' | 'discard') => {
    if (!session) return;
    if (await store.mutate('end', `/${session.id}/${action}`, 'POST', undefined, action === 'finish' ? '' : undefined)) setFinish(false);
  };
  const volume = totals.volume === null ? '—' : totals.volume.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const sessionSummary = active && session && <section className="live-summary" aria-label="Resumo da sessão">
    <h2><ListChecks size={20} aria-hidden="true" />Resumo da sessão</h2>
    <div className="live-summary-grid">
      <div><strong>{currentIndex >= 0 ? `${currentIndex + 1} de ${session.exercises.length}` : session.exercises.length}</strong><span>exercícios</span></div>
      <div><strong data-testid="sets">{totals.sets ?? '—'}</strong><span>séries concluídas</span>{totals.warmups > 0 && <small>+ {totals.warmups} aquecimento{totals.warmups > 1 ? 's' : ''}</small>}</div>
      <div><strong>{formatTime(elapsed)}</strong><span>tempo de sessão</span></div>
    </div>
    <p className="live-summary-volume">Volume <strong data-testid="volume">{volume} kg</strong></p>
  </section>;
  const closeSummary = () => { store.clearClosed(); navigate('/workout', { replace: true }); };
  // Presentation after finish only. Refresh resumes GET active; no local summary persistence.
  if (session?.status === 'COMPLETED') return <div className="workout-live"><WorkoutCompletionSummary
    session={session} records={Object.values(personalRecords)} recordsLoading={personalRecordsLoading} recordsError={personalRecordsError}
    onRetry={store.refreshRecords} onClose={closeSummary} /></div>;
  if (session?.status === 'DISCARDED') return <div className="workout-live"><main className="live-main live-finished">
    <h1>Treino descartado</h1><Button variant="outline" onClick={closeSummary}>Voltar aos treinos</Button>
  </main></div>;
  return <div className="workout-live">
    <header className="live-header"><div className="live-header-inner">
      <button type="button" aria-label="Sair do treino" className="icon-button" onClick={leave}><ChevronLeft size={22} /></button>
      <div className="live-title"><span className="live-mobile-clock">{formatTime(elapsed)}</span>
        <span className="sr-only">{active ? 'Treino em andamento' : session ? 'Treino encerrado' : 'Novo treino'}</span>
        <Input aria-label="Nome do treino" value={session?.name ?? (routineId ? 'Treino da rotina' : name)} maxLength={100} readOnly={Boolean(session) || Boolean(routineId)} disabled={loading || unavailable || pending.includes('start')}
          onChange={event => setName(event.target.value)} /></div>
      <span className="live-header-clock"><Timer size={20} aria-hidden="true" /><span><strong>{formatTime(elapsed)}</strong><small>Tempo de sessão</small></span></span>
      {active && <Button disabled={frozen} onClick={() => setFinish(true)}>Concluir</Button>}
    </div></header>
    <main className="live-main">
      {loading && !session ? <p role="status" className="live-notice">Carregando seu treino…</p> : <>
        {loading && <p role="status" className="live-notice">Atualizando treino…</p>}
        {error && <Card role="alert" className="live-notice"><p>{error}</p>{!finish && <Button variant="outline" disabled={loading || pending.length > 0} onClick={() => { void store.load(); }}>Atualizar treino</Button>}</Card>}
        {routineId && active && session.routineId !== routineId && <p className="live-notice">Retomando o treino ativo. Termine ou descarte este treino antes de iniciar outra rotina.</p>}
        {previousError && <p role="status" className="live-notice">{previousError}</p>}
        {personalRecordsError && <p role="status" className="live-notice">{personalRecordsError}</p>}
        {totals.error && <p role="alert" className="live-field-error">{totals.error}</p>}
        {!currentExercise && sessionSummary}
        {!session && !unavailable && <section className="live-empty"><h1>{routineId ? 'Inicie o treino com sua rotina.' : 'Seu treino ainda não foi iniciado.'}</h1>
          <Button disabled={pending.includes('start') || !name.trim()} onClick={() => {
            void store.mutate('start', '', 'POST', { ...(routineId ? { routineId } : { name: name.trim() }) });
          }}>{pending.includes('start') ? 'Iniciando…' : 'Iniciar treino'}</Button></section>}
        {active && !session.exercises.length && <section className="live-empty"><h1>Seu treino ainda não possui exercícios.</h1>
          <Button onClick={() => setSelector(true)} disabled={frozen}><Plus size={18} />Adicionar exercício</Button></section>}
        <div className="live-exercises">{orderedExercises.map((exercise, index) => <Fragment key={exercise.id}>
          {index === 1 && currentExercise && <h2 className="live-other-heading">Outros exercícios da sessão</h2>}
          <div><LiveExerciseCard previous={previous[exercise.id]} exercise={exercise} disabled={frozen} isCurrent={exercise.id === nextExerciseId}
            store={store} sessionId={session!.id} catalog={catalog.find(item => item.id === exercise.exerciseId)}
            sessionSummary={exercise.id === nextExerciseId ? sessionSummary : undefined} /></div>
          {index === 0 && currentExercise && upcomingExercises.length > 0 && <section className="live-upcoming" aria-label="Próximos exercícios">
            <h2><ListChecks size={20} aria-hidden="true" />Próximos exercícios</h2>
            <ul>{upcomingExercises.map(next => {
              const item = catalog.find(entry => entry.id === next.exerciseId);
              return <li key={next.id}>
                <div className="live-upcoming-thumb">{item ? <ExerciseThumbnail exercise={item} /> : <div className="exercise-thumbnail"><div className="exercise-placeholder"><MuscleVisual muscle={next.primaryMuscleSnapshot} /></div></div>}</div>
                <div className="live-upcoming-copy"><strong>{next.exerciseNameSnapshot}</strong><span>{muscleLabels[next.primaryMuscleSnapshot] ?? next.primaryMuscleSnapshot} · {equipmentLabels[next.equipmentSnapshot] ?? next.equipmentSnapshot}</span></div>
                <span className="live-upcoming-count">{next.sets.filter(set => Boolean(set.completedAt)).length}/{next.sets.length}<span className="sr-only"> séries concluídas</span></span>
              </li>;
            })}</ul>
          </section>}
        </Fragment>)}</div>
        {active && session.exercises.length > 0 && <Button className="live-add-exercise" variant="outline" disabled={frozen} onClick={() => setSelector(true)}><Plus size={18} />Adicionar exercício</Button>}
        {active && <button type="button" className="live-discard" disabled={frozen} onClick={() => {
          if (window.confirm('Descartar este treino? A sessão será encerrada e os dados já salvos serão preservados.')) void endSession('discard');
        }}><Trash2 size={16} aria-hidden="true" />Descartar treino</button>}
        {pending.length > 0 && <p role="status" className="live-notice">{ending ? 'Encerrando treino…' : 'Salvando…'}</p>}
        {dirty.length > 0 && <p role="status" className="live-notice">Há edições ainda não salvas.</p>}
      </>}
    </main>
    {selector && active && <ExerciseSelector onClose={() => setSelector(false)} onAdd={async exercises => {
      const added: string[] = [];
      for (const exercise of exercises) {
        if (!await store.mutate('add-exercise', `/${session.id}/exercises`, 'POST', { exerciseId: exercise.id })) break;
        added.push(exercise.id);
      }
      return added;
    }} />}
    {finish && active && <Sheet open label="Concluir treino" onClose={() => { if (!ending) setFinish(false); }}><div className="sheet-panel live-finish-panel">
      <header><h2>Concluir este treino?</h2><Button variant="ghost" disabled={ending} aria-label="Fechar resumo" onClick={() => setFinish(false)}><X size={20} /></Button></header>
      <p>{totals.sets ?? '—'} séries principais · {volume} kg · {formatTime(elapsed)}</p>
      <p>As séries pendentes continuarão sem conclusão.</p>
      {dirty.length > 0 && <p role="alert" className="live-field-error">Salve ou corrija as edições pendentes antes de concluir.</p>}
      {error && <p role="alert" className="live-field-error">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={ending} onClick={() => setFinish(false)}>Continuar treinando</Button>
        <Button disabled={ending || dirty.length > 0 || unavailable} onClick={() => { void endSession('finish'); }}>{ending ? 'Concluindo…' : 'Concluir treino'}</Button></div>
    </div></Sheet>}
  </div>;
}
