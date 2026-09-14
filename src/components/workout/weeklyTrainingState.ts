import { apiFetch } from '../../lib/api';
import type { RoutineSummary, TrainingWeekday, WeeklyTrainingPlan } from '../../shared/weeklyTraining';

type Request = (path: string, options?: { method?: string; data?: object }) => Promise<any>;
interface State {
  plans: WeeklyTrainingPlan[]; routines: RoutineSummary[]; selectedId: string | null;
  loading: boolean; loaded: boolean; pending: boolean; error: string; errorPlanId: string | null; authExpired: boolean;
}
export function createWeeklyTrainingStore(request: Request = apiFetch) {
  let state: State = { plans: [], routines: [], selectedId: null, loading: false, loaded: false,
    pending: false, error: '', errorPlanId: null, authExpired: false };
  let revision = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const fail = (error: unknown, planId: string | null = null) => {
    const status = (error as { status?: number }).status;
    update({ error: error instanceof Error ? error.message : 'Não foi possível salvar o plano.', errorPlanId: planId,
      authExpired: status === 401 || status === 403 });
  };
  const save = async (path: string, method: string, data?: object, planId: string | null = null, activate = false) => {
    if (state.pending) return false;
    ++revision; // Older loads must never overwrite a confirmed mutation.
    update({ pending: true, loading: false, error: '', errorPlanId: null });
    try {
      const plan: WeeklyTrainingPlan = await request(`/workouts/plans${path}`, { method, data });
      const exists = state.plans.some(row => row.id === plan.id);
      const plans = state.plans.map(row => row.id === plan.id ? plan : activate ? { ...row, isActive: false } : row);
      if (!exists) plans.unshift(plan);
      update({ plans, selectedId: planId ? state.selectedId : plan.id, loaded: true });
      return true;
    } catch (error) { fail(error, planId); return false; }
    finally { update({ pending: false }); }
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    select(id: string) { if (state.plans.some(plan => plan.id === id)) update({ selectedId: id, error: '', errorPlanId: null }); },
    async load() {
      if (state.pending) return;
      const version = ++revision;
      update({ loading: true, error: '', errorPlanId: null });
      try {
        const [plans, routines]: [WeeklyTrainingPlan[], RoutineSummary[]] = await Promise.all([
          request('/workouts/plans'), request('/workouts/routines?summary=true'),
        ]);
        if (version !== revision) return;
        update({ plans, routines, loaded: true,
          selectedId: plans.some(plan => plan.id === state.selectedId) ? state.selectedId : (plans.find(plan => plan.isActive) ?? plans[0])?.id ?? null });
      } catch (error) { if (version === revision) fail(error); }
      finally { if (version === revision) update({ loading: false }); }
    },
    create: (name: string) => save('', 'POST', { name, source: 'CUSTOM' }),
    rename: (id: string, name: string) => save(`/${id}`, 'PATCH', { name }, id),
    activate: (id: string) => save(`/${id}/activate`, 'POST', {}, id, true),
    setDay: (id: string, day: TrainingWeekday, routineId: string) => save(`/${id}/days/${day}`, 'PUT', { routineId }, id),
    removeDay: (id: string, day: TrainingWeekday) => save(`/${id}/days/${day}`, 'DELETE', undefined, id),
    async start(routineId: string) {
      if (state.pending) return false;
      update({ pending: true, error: '', errorPlanId: null });
      try {
        const active = await request('/workouts/sessions/active');
        if (!active) {
          try { await request('/workouts/sessions', { method: 'POST', data: { routineId } }); }
          catch (error) {
            if ((error as { status?: number }).status !== 409 || !await request('/workouts/sessions/active')) throw error;
          }
        }
        return true;
      } catch (error) { fail(error); return false; }
      finally { update({ pending: false }); }
    },
  };
}
