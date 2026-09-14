import type { LiveSession, PersonalRecord } from './model';

export function completionSummary(session: LiveSession, records: PersonalRecord[]) {
  if (session.status !== 'COMPLETED') return null;
  const elapsed = session.endedAt ? Date.parse(session.endedAt) - Date.parse(session.startedAt) : NaN;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Duração do treino indisponível: timestamps inválidos.');
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(minutes / 60);
  const duration = minutes < 1 ? 'Menos de 1 min' : hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ''}` : `${minutes} min`;
  const best = new Map<string, PersonalRecord & { name: string }>();
  for (const record of records) {
    const exercise = session.exercises.find(ex => ex.exerciseId === record.exerciseId && ex.measurementTypeSnapshot === 'WEIGHT_REPS'
      && ex.sets.some(set => set.id === record.workoutSetId && set.type === 'WORKING' && set.completedAt));
    if (!exercise || record.type !== 'ESTIMATED_1RM_PR') continue;
    // Presentation aggregation of backend achievements; never calculate e1RM here.
    if (!best.has(record.exerciseId) || record.currentValue > best.get(record.exerciseId)!.currentValue) {
      best.set(record.exerciseId, { ...record, name: exercise.exerciseNameSnapshot });
    }
  }
  return { name: session.name, duration, exerciseCount: session.exercises.length,
    setCount: session.exercises.reduce((count, ex) => count + ex.sets.filter(set => set.completedAt != null).length, 0),
    records: [...best.values()] };
}
