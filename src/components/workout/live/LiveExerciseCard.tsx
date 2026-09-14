import { useState, useEffect } from 'react';
import { MoreVertical, Plus, Timer } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ExerciseThumbnail, MuscleVisual } from '../ExerciseThumbnail';
import { muscleLabels, equipmentLabels } from '../../../shared/activityOptions';
import { ExerciseNote } from './ExerciseNote';
import { NumericField, SetRow } from './SetRow';
import { formatTime, previousSetLabels, type PreviousPerformance, type LiveExercise, type LiveCatalogExercise, type SetType } from './model';
import type { LiveWorkoutStore } from './state';

export function LiveExerciseCard({ exercise, disabled, isCurrent, store, sessionId, catalog, previous }: {
  exercise: LiveExercise; disabled: boolean; isCurrent: boolean; store: LiveWorkoutStore; sessionId: string; catalog?: LiveCatalogExercise; previous?: PreviousPerformance | null;
}) {
  const [restOpen, setRestOpen] = useState(false);
  const [defaultRest, setDefaultRest] = useState(exercise.sets.at(-1)?.restTime ?? 0);
  const [rest, setRest] = useState<number | null>(defaultRest);
  const [applying, setApplying] = useState(false);
  const [type, setType] = useState<SetType>('WORKING');
  const base = `/${sessionId}/exercises/${exercise.id}`;
  const restKey = `${exercise.id}:rest`;
  useEffect(() => () => store.dirty(restKey, false), [store, restKey]);
  const busy = store.getSnapshot().pending.includes(exercise.id);
  const unsupported = exercise.measurementTypeSnapshot !== 'WEIGHT_REPS';
  const frozen = disabled || unsupported;
  const rests = new Set(exercise.sets.map(set => set.restTime));
  const shownRest = rests.size > 1 ? 'Variado' : formatTime(exercise.sets[0]?.restTime ?? defaultRest);
  const previousLabels = previousSetLabels(exercise.sets, previous);
  let workingNumber = 0;
  const nextSetId = isCurrent && !frozen ? exercise.sets.find(set => !set.completedAt)?.id : undefined;
  return <section className="live-exercise" aria-label={exercise.exerciseNameSnapshot}>
    <div className="live-exercise-heading">
      <div className="live-thumb">{catalog ? <ExerciseThumbnail exercise={catalog} /> : <div className="exercise-thumbnail"><div className="exercise-placeholder"><MuscleVisual muscle={exercise.primaryMuscleSnapshot} /></div></div>}</div>
      <div className="min-w-0 flex-1"><h2>{exercise.exerciseNameSnapshot}</h2><p>{muscleLabels[exercise.primaryMuscleSnapshot] ?? exercise.primaryMuscleSnapshot} · {equipmentLabels[exercise.equipmentSnapshot] ?? exercise.equipmentSnapshot}</p></div>
      {!disabled && <details className="live-menu live-exercise-menu" onKeyDown={event => {
        if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
      }}><summary aria-label={`Opções de ${exercise.exerciseNameSnapshot}`}><MoreVertical size={20} /></summary>
        <div className="live-menu-panel"><button type="button" disabled={busy || applying} onClick={() => {
          if (window.confirm('Remover este exercício, suas séries e sua nota?')) void store.mutate(exercise.id, base, 'DELETE');
        }}>Remover exercício</button></div>
      </details>}
    </div>
    {previous?.notes && <div className="live-previous-note"><span>Nota anterior</span><blockquote>{previous.notes}</blockquote></div>}
    <ExerciseNote notes={exercise.notes} disabled={disabled} store={store} base={base} exerciseId={exercise.id} />
    {unsupported && <p className="live-notice">Execução disponível apenas para exercícios com carga e repetições.</p>}
    <div className="live-rest">
      <button type="button" disabled={frozen || applying} onClick={() => { setRest(exercise.sets[0]?.restTime ?? defaultRest); if (restOpen) store.dirty(restKey, false); setRestOpen(value => !value); }} aria-expanded={restOpen}>
        <Timer size={15} aria-hidden="true" />Descanso: {shownRest}
      </button>
      {restOpen && !frozen && <div className="live-rest-edit">
        <label>Segundos após cada série<NumericField label="Descanso planejado em segundos" value={rest} integer disabled={applying} onChange={value => { setRest(value); store.dirty(restKey, true); }} /></label>
        <Button size="sm" disabled={rest === null || applying} onClick={async () => {
          if (rest === null) return;
          setApplying(true);
          try {
            for (const set of exercise.sets) {
              if (set.restTime !== rest && !await store.mutate(exercise.id, `${base}/sets/${set.id}`, 'PATCH', { restTime: rest })) return;
            }
            setDefaultRest(rest); store.dirty(restKey, false); setRestOpen(false);
          } finally { setApplying(false); }
        }}>{applying ? 'Salvando…' : 'Aplicar a todas'}</Button>
      </div>}
    </div>
    <div className="live-table-heading live-set-grid" aria-hidden="true"><span>Série</span><span>Anterior</span><span>KG</span><span>Reps</span><span>Feita</span></div>
    <div className="live-set-list">{exercise.sets.map(set => <div key={set.id}><SetRow set={set} isNext={set.id === nextSetId} number={set.type === 'WORKING' ? ++workingNumber : set.setNumber}
      disabled={frozen} store={store} base={base} previous={previousLabels[set.id]} /></div>)}</div>
    {!frozen && <div className="live-new-set flex flex-wrap items-center gap-2">
      <select className="kindra-input" aria-label={`Tipo da nova série de ${exercise.exerciseNameSnapshot}`} value={type} disabled={busy || applying} onChange={event => setType(event.target.value as SetType)}>
        <option value="WORKING">Série válida</option><option value="WARMUP">Aquecimento</option><option value="DROP_SET">Drop set</option>
      </select>
      <Button variant="ghost" className="live-add-set" disabled={busy || applying} onClick={() => {
        const previous = [...exercise.sets].reverse().find(set => set.type !== 'DROP_SET');
        void store.mutate(exercise.id, `${base}/sets`, 'POST', { type, restTime: defaultRest,
          ...(type === 'DROP_SET' ? {} : { weight: previous?.weight ?? null, reps: previous?.reps ?? null }) });
      }}><Plus size={16} />Adicionar série</Button>
    </div>}
  </section>;
}
