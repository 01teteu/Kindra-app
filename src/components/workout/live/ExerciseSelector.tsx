import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { ExerciseCard } from '../ExerciseCard';
import { emptyExerciseFilters, filterExercises, quickMuscleGroups } from '../exerciseFilters';
import { apiFetch } from '../../../lib/api';
import { catalogSchema, type LiveCatalogExercise } from './model';

export function ExerciseSelector({ onClose, onAdd }: { onClose: () => void; onAdd: (exercises: LiveCatalogExercise[]) => Promise<string[]> }) {
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  const [exercises,setExercises] = useState<LiveCatalogExercise[]>([]);
  const [query,setQuery] = useState('');
  const [muscles,setMuscles] = useState<string[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    apiFetch('/workouts/exercises', { signal: controller.signal }).then(data => {
      const rows = catalogSchema.parse(data);
      if (!controller.signal.aborted) setExercises(rows.filter(exercise => exercise.measurementType === 'WEIGHT_REPS') as LiveCatalogExercise[]);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar o catálogo. Tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const filtered = useMemo(() => filterExercises(exercises,query,{ ...emptyExerciseFilters,muscles })
    .sort((a,b) => a.name.localeCompare(b.name,'pt-BR')), [exercises,query,muscles]);
  return <Sheet open onClose={() => { if (!saving) onClose(); }} label="Adicionar exercícios">
    <div className="sheet-panel live-selector">
      <header><div><h2>Adicionar exercícios</h2><p>Exercícios com carga e repetições.</p></div>
        <Button variant="ghost" aria-label="Fechar seleção" disabled={saving} onClick={onClose}><X size={20} /></Button></header>
      <div className="live-selector-search"><Search size={18} aria-hidden="true" /><Input aria-label="Buscar exercício" placeholder="Buscar exercício…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="exercise-quick-filters" role="group" aria-label="Grupos musculares">
        {[{ label:'Todos',codes:[] },...quickMuscleGroups].map(group => <button type="button" key={group.label} className={`exercise-chip${muscles.join() === group.codes.join() ? ' is-active' : ''}`}
          aria-pressed={muscles.join() === group.codes.join()} onClick={() => setMuscles(group.codes)}>{group.label}</button>)}
      </div>
      <div className="live-selector-results" aria-busy={loading}>
        {loading ? <p role="status" className="live-selector-empty">Carregando catálogo…</p> : error ? <div role="alert" className="live-selector-empty"><p>{error}</p><Button onClick={() => setAttempt(v => v+1)}>Tentar novamente</Button></div>
          : !filtered.length ? <div className="live-selector-empty"><p>{exercises.length ? 'Nenhum exercício para esta busca.' : 'Nenhum exercício com carga e repetições disponível.'}</p>
            {exercises.length > 0 && <Button variant="ghost" onClick={() => { setQuery(''); setMuscles([]); }}>Limpar busca e filtros</Button>}</div>
            : <div className="live-selector-grid">{filtered.map(exercise => <div key={exercise.id}><ExerciseCard exercise={exercise} selected={selected.includes(exercise.id)}
              onToggle={() => { if (!saving) setSelected(ids => ids.includes(exercise.id) ? ids.filter(id => id !== exercise.id) : [...ids,exercise.id]); }} /></div>)}</div>}
      </div>
      <footer>{saveError && <p role="alert" className="live-field-error">{saveError}</p>}<span role="status">{selected.length} selecionado{selected.length === 1 ? '' : 's'}</span>
        <Button disabled={saving || !selected.length || loading || Boolean(error)} onClick={async () => {
          setSaving(true); setSaveError('');
          try {
            const added = await onAdd(selected.map(id => exercises.find(exercise => exercise.id === id)!));
            setSelected(ids => ids.filter(id => !added.includes(id)));
            if (added.length === selected.length) onClose();
            else setSaveError('Nem todos os exercícios foram confirmados. Confira o treino antes de tentar novamente.');
          } finally { setSaving(false); }
        }}>Adicionar{selected.length ? ` (${selected.length})` : ''}</Button></footer>
    </div>
  </Sheet>;
}
