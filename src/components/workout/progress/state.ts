import { fetchWorkoutProgress, type ProgressRequest } from '../../../lib/workoutProgress';
import type { WorkoutProgress, ProgressPoint } from '../../../shared/workoutProgress';

export type Preset = 'month' | 'previous' | '30days' | 'custom';
export type DateRange = { startDate: string; endDate: string };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): DateRange {
  const year = now.getFullYear(), month = now.getMonth();
  if (preset === '30days') return { startDate: localDate(new Date(year, month, now.getDate() - 29)), endDate: localDate(now) };
  const offset = preset === 'previous' ? -1 : 0;
  return { startDate: localDate(new Date(year, month + offset, 1)), endDate: localDate(new Date(year, month + offset + 1, 0)) };
}
export function validRange(range: DateRange) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(0); date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
    return y > 0 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  };
  return valid(range.startDate) && valid(range.endDate) && range.startDate <= range.endDate;
}
export type ProgressState = {
  range: DateRange; timeZone: string; data: WorkoutProgress | null; selectedId: string;
  points: ProgressPoint[]; nextCursor: string | null;
  loading: boolean; detailLoading: boolean; moreLoading: boolean;
  error: string; detailError: string; moreError: string; authExpired: boolean;
};
type Fetcher = typeof fetchWorkoutProgress;
export function createProgressStore(fetcher: Fetcher = fetchWorkoutProgress, now = new Date(), zone?: string) {
  let timeZone = zone ?? '';
  if (zone === undefined) { try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* Explicit error below. */ } }
  let state: ProgressState = {
    range: presetRange('month', now), timeZone, data: null, selectedId: '', points: [], nextCursor: null,
    loading: false, detailLoading: false, moreLoading: false, error: '', detailError: '', moreError: '', authExpired: false,
  };
  const listeners = new Set<() => void>();
  let version = 0;
  let controller: AbortController | undefined;
  const update = (patch: Partial<ProgressState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const begin = () => { controller?.abort(); controller = new AbortController(); return { generation: ++version, signal: controller.signal }; };
  const request = (exerciseId = state.selectedId, cursor?: string): ProgressRequest => ({ ...state.range, timeZone: state.timeZone, ...(exerciseId ? { exerciseId } : {}), ...(cursor ? { cursor } : {}) });
  const failure = (error: unknown, field: 'error' | 'detailError' | 'moreError') => {
    const status = (error as { status?: number })?.status;
    update({ authExpired: status === 401, [field]: status === 403 ? 'Sua sessão não permite acessar estes dados. Entre novamente.' : 'Não foi possível carregar os dados. Tente novamente.' });
  };
  const select = async (id: string) => {
    if (!state.data?.exercises.some(exercise => exercise.exerciseId === id)) return;
    const { generation, signal } = begin();
    update({ selectedId: id, points: [], nextCursor: null, detailLoading: true, moreLoading: false, detailError: '', moreError: '' });
    try {
      const response = await fetcher(request(id), signal);
      if (generation !== version) return;
      update({ points: response.progression?.points ?? [], nextCursor: response.progression?.nextCursor ?? null });
    } catch (error) { if (generation === version) failure(error, 'detailError'); }
    finally { if (generation === version) update({ detailLoading: false }); }
  };
  const load = async (range = state.range) => {
    if (!validRange(range)) { update({ error: 'Informe um intervalo de datas válido.' }); return; }
    if (!state.timeZone) { update({ error: 'Não foi possível identificar seu fuso horário. Recarregue a página para tentar novamente.' }); return; }
    const preferred = state.selectedId;
    const { generation, signal } = begin();
    update({ range, data: null, loading: true, detailLoading: false, moreLoading: false, points: [], nextCursor: null, error: '', detailError: '', moreError: '' });
    try {
      const response = await fetcher(request(''), signal);
      if (generation !== version) return;
      const sorted = [...response.exercises].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.exerciseId.localeCompare(b.exerciseId));
      const id = sorted.find(exercise => exercise.exerciseId === preferred)?.exerciseId
        ?? sorted.find(exercise => exercise.periodSessionCount > 0)?.exerciseId ?? sorted[0]?.exerciseId ?? '';
      update({ data: { ...response, exercises: sorted }, loading: false, selectedId: id });
      if (id) await select(id);
    } catch (error) { if (generation === version) failure(error, 'error'); }
    finally { if (generation === version) update({ loading: false }); }
  };
  const more = async () => {
    if (!state.nextCursor || state.moreLoading || state.detailLoading || !state.selectedId) return;
    const { generation, signal } = begin();
    update({ moreLoading: true, moreError: '' });
    try {
      const response = await fetcher(request(state.selectedId, state.nextCursor), signal);
      if (generation !== version) return;
      const seen = new Set(state.points.map(point => point.sessionId));
      update({ points: [...state.points, ...(response.progression?.points ?? []).filter(point => !seen.has(point.sessionId))], nextCursor: response.progression?.nextCursor ?? null });
    } catch (error) { if (generation === version) failure(error, 'moreError'); }
    finally { if (generation === version) update({ moreLoading: false }); }
  };
  return {
    getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, select, more, dispose: () => { version++; controller?.abort(); },
  };
}
