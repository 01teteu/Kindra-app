import { workoutApi, safeError, type MutationMethod } from './api';
import type { LiveSession, PreviousPerformance, PersonalRecord } from './model';

// One confirmed session; only pending actions and unsaved editor flags live beside it.
export function createLiveWorkoutStore(api = workoutApi) {
  let snapshot = { personalRecords: {} as Record<string, PersonalRecord>, personalRecordsLoading: false, personalRecordsError: '', previous: {} as Record<string, PreviousPerformance | null>, previousError: '', session: null as LiveSession | null, loading: true, unavailable: false, error: '', authExpired: false, pending: [] as string[], dirty: [] as string[] };
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  let loadingRequest: Promise<void> | undefined;
  let generation = 0;
  const publish = (patch: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  let recordsRequest = 0;
  // Association and display guards only; PR eligibility/calculation belongs to the backend.
  const recordMap = (session: LiveSession | null, records: PersonalRecord[]) => Object.fromEntries(records.filter(record =>
    session?.exercises.some(exercise => exercise.exerciseId === record.exerciseId && exercise.measurementTypeSnapshot === 'WEIGHT_REPS'
      && exercise.sets.some(set => set.id === record.workoutSetId && set.type === 'WORKING' && set.completedAt))
  ).map(record => [record.workoutSetId, record]));
  const loadRecords = () => {
    const session = snapshot.session;
    const request = ++recordsRequest;
    const supported = session && session.status !== 'DISCARDED';
    publish({ personalRecordsError: '', personalRecordsLoading: Boolean(supported) });
    if (!supported) return;
    void api.personalRecords(session.id).then(response => {
      if (request !== recordsRequest || snapshot.session?.id !== session.id) return;
      publish({ personalRecords: recordMap(snapshot.session, response.items), personalRecordsLoading: false });
    }).catch(cause => {
      if (request !== recordsRequest || snapshot.session?.id !== session.id) return;
      publish({ personalRecordsLoading: false, personalRecordsError: `PRs indisponíveis. ${safeError(cause).message}` });
    });
  };
  let previousKey = '';
  let previousRequest = 0;
  const loadPrevious = (force = false) => {
    const session = snapshot.session;
    const key = session ? `${session.id}:${session.exercises.map(item => item.id).sort().join(',')}` : '';
    if (!force && key === previousKey) return;
    const sameSession = previousKey.startsWith(`${session?.id}:`);
    previousKey = key;
    const request = ++previousRequest;
    publish({ previous: sameSession ? snapshot.previous : {}, previousError: '' });
    if (!session?.exercises.length) return;
    void api.previous(session.id).then(response => {
      if (request !== previousRequest || snapshot.session?.id !== session.id) return;
      publish({ previous: Object.fromEntries(response.items.map(item => [item.workoutExerciseId, item.previous])) });
    }).catch(cause => {
      if (request !== previousRequest || snapshot.session?.id !== session.id) return;
      publish({ previousError: `Anterior indisponível. ${safeError(cause).message}` });
    });
  };
  const recover = async (refreshPrevious = false) => {
    ++recordsRequest;
    try {
      const session = await api.active();
      publish({ session, personalRecords: {}, unavailable: false, dirty: session?.id === snapshot.session?.id ? snapshot.dirty : [] });
      loadPrevious(refreshPrevious || Boolean(snapshot.previousError));
      loadRecords();
      return true;
    } catch (cause) {
      const error = safeError(cause);
      publish({ unavailable: true, authExpired: [401, 403].includes(error.status), error: error.message });
      return false;
    }
  };
  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() {
      // React StrictMode can hydrate twice concurrently; share that read and its PR request.
      if (!loadingRequest) loadingRequest = (async () => {
        await queue;
        publish({ loading: true, error: '' });
        await recover();
        publish({ loading: false });
      })().finally(() => { loadingRequest = undefined; });
      return loadingRequest;
    },
    dirty(key: string, value: boolean) {
      const dirty = snapshot.dirty.filter(item => item !== key);
      if (value) dirty.push(key);
      publish({ dirty });
    },
    refreshRecords: loadRecords,
    clearClosed() { if (snapshot.session?.status !== 'ACTIVE') { ++recordsRequest; publish({ session: null, personalRecords: {}, personalRecordsLoading: false, personalRecordsError: '', dirty: [], error: '' }); loadPrevious(); } },
    mutate(key: string, path: string, method: MutationMethod, data?: object, guardPrefix?: string): Promise<boolean> {
      const scheduledGeneration = generation;
      const sessionId = snapshot.session?.id;
      publish({ pending: [...snapshot.pending, key] });
      const result = queue.then(async () => {
        if (scheduledGeneration !== generation) return false;
        if (snapshot.unavailable || snapshot.loading || (path !== '' && (snapshot.session?.id !== sessionId || snapshot.session?.status !== 'ACTIVE'))) {
          publish({ error: 'Atualize o treino antes de continuar.' }); return false;
        }
        if (guardPrefix !== undefined && snapshot.dirty.some(item => item.startsWith(guardPrefix))) {
          publish({ error: 'Salve ou corrija as edições pendentes antes de concluir.' }); return false;
        }
        try {
          ++recordsRequest; // A read begun before this write may no longer describe this session.
          const session = await api.mutate(path, method, data);
          const previousSession = snapshot.session;
          const retained = session.id === previousSession?.id ? Object.values(snapshot.personalRecords).filter(record => {
            const before = previousSession.exercises.flatMap(ex => ex.sets).find(set => set.id === record.workoutSetId);
            const after = session.exercises.flatMap(ex => ex.sets).find(set => set.id === record.workoutSetId);
            return before && after && before.weight === after.weight && before.reps === after.reps && before.completedAt === after.completedAt;
          }) : [];
          const personalRecords = recordMap(session, [...retained, ...(session.achievement ? [session.achievement] : [])]);
          publish({ session, personalRecords, error: '', dirty: session.status === 'ACTIVE' ? snapshot.dirty : [] });
          loadPrevious();
          loadRecords();
          return true;
        } catch (cause) {
          generation++;
          const error = safeError(cause);
          publish({ error: error.message, authExpired: [401, 403].includes(error.status) });
          // Network failures can occur after a commit; GET also resolves ambiguous writes.
          if (![400, 401, 403].includes(error.status)) await recover(true);
          return false;
        }
      }).finally(() => {
        const pending = [...snapshot.pending];
        pending.splice(pending.indexOf(key), 1);
        publish({ pending });
      });
      queue = result.then(() => undefined);
      return result;
    },
  };
  return store;
}
export type LiveWorkoutStore = ReturnType<typeof createLiveWorkoutStore>;
