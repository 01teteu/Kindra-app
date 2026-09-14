import { apiFetch } from '../../../lib/api';
import { sessionSchema, previousPerformanceSchema, personalRecordsSchema } from './model';

export type MutationMethod = 'POST' | 'PATCH' | 'DELETE';
export class LiveApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function safeError(cause: unknown): LiveApiError {
  if (cause instanceof LiveApiError) return cause;
  const status = typeof cause === 'object' && cause !== null && 'status' in cause && typeof cause.status === 'number' ? cause.status : 0;
  const message = status === 401 || status === 403 ? 'Sua sessão expirou. Entre novamente.'
    : status === 404 ? 'Recurso indisponível. O treino foi atualizado.'
    : status === 409 ? 'O treino foi alterado em outra operação. Confira o estado recuperado antes de continuar.'
    : status === 400 && cause instanceof Error ? cause.message
    : 'Não foi possível confirmar a operação. Verifique sua conexão e tente novamente.';
  return new LiveApiError(status, message);
}
export const workoutApi = {
  async personalRecords(sessionId: string) {
    try { return personalRecordsSchema.parse(await apiFetch(`/workouts/sessions/${sessionId}/personal-records`)); }
    catch (cause) { throw safeError(cause); }
  },
  async previous(sessionId: string) {
    try { return previousPerformanceSchema.parse(await apiFetch(`/workouts/sessions/${sessionId}/previous-performance`)); }
    catch (cause) { throw safeError(cause); }
  },
  async active() {
    try { return sessionSchema.nullable().parse(await apiFetch('/workouts/sessions/active')); }
    catch (cause) { throw safeError(cause); }
  },
  async mutate(path: string, method: MutationMethod, data?: object) {
    try { return sessionSchema.parse(await apiFetch(`/workouts/sessions${path}`, { method, data })); }
    catch (cause) { throw safeError(cause); }
  },
};
