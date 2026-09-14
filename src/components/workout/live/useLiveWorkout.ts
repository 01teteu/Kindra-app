import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLiveWorkoutStore, type LiveWorkoutStore } from './state';

export function useLiveWorkout(): ReturnType<LiveWorkoutStore['getSnapshot']> & { store: LiveWorkoutStore } {
  const navigate = useNavigate();
  const [store] = useState(createLiveWorkoutStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { void store.load(); }, [store]);
  useEffect(() => { if (state.authExpired) navigate('/login'); }, [state.authExpired, navigate]);
  useEffect(() => {
    // Persisted execution is recovered exclusively through GET active.
    try { sessionStorage.removeItem('kindra.workout-live.demo.v1'); } catch { /* Storage is optional. */ }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = store.getSnapshot();
      if (current.dirty.length || current.pending.length) { event.preventDefault(); event.returnValue = ''; }
    };
    let index: number | undefined = window.history.state?.idx;
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return; }
      const next = event.state?.idx;
      const current = store.getSnapshot();
      const message = current.dirty.length || current.pending.length
        ? 'Sair com edições não salvas? Apenas os dados já confirmados poderão ser recuperados.'
        : 'Sair do treino em andamento? Ele continuará salvo e poderá ser retomado.';
      if (current.session?.status === 'ACTIVE' && !window.confirm(message)) {
        if (typeof index === 'number' && typeof next === 'number' && index !== next) {
          restoring = true; window.history.go(index - next);
        }
      } else index = next;
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', pop, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.setTimeout(() => window.removeEventListener('popstate', pop, true), 0);
    };
  }, [store]);
  return { ...state, store };
}
