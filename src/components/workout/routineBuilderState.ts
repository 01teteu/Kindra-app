import { z } from 'zod';
import { apiFetch } from '../../lib/api';
import { catalogSchema, type LiveCatalogExercise } from './live/model';

const routineSchema = z.object({
  id: z.string(), name: z.string(),
  exercises: z.array(z.object({ id: z.string(), exerciseId: z.string(), order: z.number().int().nonnegative(),
    notes: z.string().nullable(), restTime: z.number().int().nonnegative().nullable(),
    exercise: catalogSchema.element.extend({ isActive: z.boolean() }),
  })),
});
export interface RoutineDraftItem {
  key: string; exercise: LiveCatalogExercise & { isActive?: boolean }; notes: string; restTime: string;
}
interface State {
  name: string; items: RoutineDraftItem[]; loading: boolean; ready: boolean;
  pending: boolean; dirty: boolean; error: string; authExpired: boolean;
}
type Request = (path: string, options?: { method?: string; data?: object }) => Promise<unknown>;
const draftIdentity = (state: Pick<State, 'name' | 'items'>) => JSON.stringify({ name: state.name,
  items: state.items.map(item => [item.exercise.id, item.notes, item.restTime]),
});
export function routinePayload(name: string, items: RoutineDraftItem[]) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw Error('Informe um nome com até 100 caracteres.');
  return { name: trimmed, exercises: items.map((item, order) => {
    if (item.notes.trim().length > 500) throw Error('A nota deve ter até 500 caracteres.');
    const rest = item.restTime.trim();
    if (rest && (!/^\d+$/.test(rest) || Number(rest) > 2147483647)) throw Error('Informe o descanso em segundos inteiros, sem valor negativo.');
    return { exerciseId: item.exercise.id, order, notes: item.notes.trim() || null, restTime: rest ? Number(rest) : null };
  }) };
}
export function createRoutineBuilderStore(routineId?: string, request: Request = apiFetch) {
  let state: State = { name: '', items: [], loading: false, ready: !routineId, pending: false, dirty: false, error: '', authExpired: false };
  let baseline = draftIdentity(state);
  let version = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    state.dirty = draftIdentity(state) !== baseline;
    listeners.forEach(fn => fn());
  };
  const fail = (error: unknown) => update({ error: error instanceof Error ? error.message : 'Não foi possível salvar a rotina.',
    authExpired: [401, 403].includes((error as { status?: number })?.status ?? 0) });
  const accept = (value: unknown) => {
    const routine = routineSchema.parse(value);
    const draft = { name: routine.name, items: [...routine.exercises].sort((a, b) => a.order - b.order).map(item => ({
      key: item.id, exercise: item.exercise, notes: item.notes ?? '', restTime: item.restTime === null ? '' : String(item.restTime),
    })) };
    baseline = draftIdentity(draft);
    update({ ...draft, ready: true, error: '' });
    return routine;
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    async load() {
      if (!routineId || state.pending || state.dirty) return;
      const current = ++version;
      update({ loading: true, error: '' });
      try { const result = await request(`/workouts/routines/${routineId}`); if (current === version) accept(result); }
      catch (error) { if (current === version) fail(error); }
      finally { if (current === version) update({ loading: false }); }
    },
    setName(name: string) { if (!state.pending) update({ name }); },
    add(exercises: LiveCatalogExercise[]) {
      if (state.pending) return;
      update({ items: [...state.items, ...exercises.map(exercise => ({ key: crypto.randomUUID(), exercise, notes: '', restTime: '' }))] });
    },
    edit(key: string, patch: Pick<Partial<RoutineDraftItem>, 'notes' | 'restTime'>) {
      if (!state.pending) update({ items: state.items.map(item => item.key === key ? { ...item, ...patch } : item) });
    },
    remove(key: string) { if (!state.pending) update({ items: state.items.filter(item => item.key !== key) }); },
    move(key: string, direction: -1 | 1) {
      if (state.pending) return;
      const index = state.items.findIndex(item => item.key === key); const target = index + direction;
      if (index < 0 || target < 0 || target >= state.items.length) return;
      const items = [...state.items]; [items[index], items[target]] = [items[target], items[index]]; update({ items });
    },
    async save() {
      if (state.pending || !state.ready || state.loading) return null;
      ++version; update({ pending: true, error: '' });
      try {
        const data = routinePayload(state.name, state.items);
        return accept(await request(`/workouts/routines${routineId ? `/${routineId}` : ''}`, { method: routineId ? 'PATCH' : 'POST', data }));
      } catch (error) { fail(error); return null; }
      finally { update({ pending: false }); }
    },
    async removeRoutine() {
      if (!routineId || state.pending || !state.ready) return false;
      ++version; update({ pending: true, error: '' });
      try {
        await request(`/workouts/routines/${routineId}`, { method: 'DELETE' });
        baseline = draftIdentity(state); update({}); return true;
      } catch (error) { fail(error); return false; }
      finally { update({ pending: false }); }
    },
  };
}
