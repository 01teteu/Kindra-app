import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Check, Dumbbell, ChevronLeft, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { type CatalogExercise } from '../shared/activityOptions';
import { ExerciseCard } from '../components/workout/ExerciseCard';
import { MuscleFilterSheet } from '../components/workout/MuscleFilterSheet';
import { emptyExerciseFilters, filterExercises, quickMuscleGroups } from '../components/workout/exerciseFilters';
import './exercise-catalog.css';

export function ExerciseCatalog() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(emptyExerciseFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');
    apiFetch('/workouts/exercises', { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Formato de catálogo inválido.');
        if (!controller.signal.aborted) setExercises(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError('Não foi possível carregar os exercícios. Tente novamente.');
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const groups = useMemo(() => {
    const available = new Set(exercises.map(ex => ex.primaryMuscle));
    return [{ label: 'Todos', codes: [] }, ...quickMuscleGroups
      .map(group => ({ ...group, codes: group.codes.filter(code => available.has(code)) }))
      .filter(group => group.codes.length > 0)];
  }, [exercises]);
  const filteredExercises = useMemo(() => filterExercises(exercises, searchQuery, filters)
    .sort((a, b) => (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })),
  [exercises, searchQuery, filters, sort]);
  const hasFilters = filters.muscles.length > 0 || Boolean(filters.equipment);
  const hasSearch = Boolean(searchQuery.trim());
  const filterCount = filters.muscles.length + (filters.equipment ? 1 : 0);
  const toggleSelection = (id: string) => setSelectedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="page-container exercise-catalog">
      <header className="page-heading">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="icon-button mt-1"><ChevronLeft size={22} /></button>
          <div>
            <h1>Exercícios</h1>
            <p>Encontre movimentos por músculo, equipamento ou nome.</p>
          </div>
        </div>
      </header>

      <div className="exercise-search-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-kindra-400" aria-hidden="true" />
          <Input placeholder="Buscar exercício..." aria-label="Buscar exercício" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} className="pl-12 pr-12" />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpar busca"
            className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-kindra-500"><X size={18} /></button>}
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen} aria-label="Filtros avançados"
          disabled={isLoading || Boolean(loadError) || !exercises.length}>
          <SlidersHorizontal size={17} aria-hidden="true" /><span className="hidden sm:inline">Filtros</span>{filterCount > 0 && <span className="exercise-filter-count">{filterCount}</span>}
        </Button>
      </div>

      <div className="exercise-quick-filters" role="group" aria-label="Filtros rápidos por grupo muscular">
        {groups.map(group => {
          const active = filters.muscles.length === group.codes.length && group.codes.every(code => filters.muscles.includes(code));
          return <button key={group.label} type="button" className={`exercise-chip${active ? ' is-active' : ''}`}
            aria-pressed={active} disabled={isLoading || Boolean(loadError)}
            onClick={() => setFilters(current => ({ ...current, muscles: group.codes }))}>
            {active && <Check size={14} aria-hidden="true" />}{group.label}
          </button>;
        })}
      </div>

      <section aria-label="Resultados do catálogo" aria-busy={isLoading}>
        <div className="exercise-results-bar">
          <div>
            <p role="status" aria-live="polite" className="text-sm font-semibold text-kindra-900">
              {isLoading ? 'Carregando exercícios…' : loadError ? 'Catálogo indisponível' : `${filteredExercises.length} exercício${filteredExercises.length === 1 ? '' : 's'}`}
            </p>
            {!isLoading && !loadError && filteredExercises.length > 0 && <p className="mt-1 text-xs text-kindra-500">Selecione para continuar.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters && <Button variant="ghost" size="sm" onClick={() => setFilters(emptyExerciseFilters)}>Limpar filtros</Button>}
            <label className="sr-only" htmlFor="exercise-sort">Ordenar exercícios</label>
            <select id="exercise-sort" className="kindra-input exercise-sort" value={sort} onChange={e => setSort(e.target.value)}
              disabled={isLoading || Boolean(loadError) || !exercises.length}>
              <option value="asc">Nome A–Z</option><option value="desc">Nome Z–A</option>
            </select>
          </div>
        </div>

        {isLoading ? <div className="exercise-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="kindra-card overflow-hidden animate-pulse">
            <div className="aspect-[16/9] bg-kindra-200/50" />
            <div className="space-y-3 p-4"><div className="h-3 w-1/3 rounded bg-kindra-200" /><div className="h-5 w-5/6 rounded bg-kindra-200" /><div className="h-3 w-1/2 rounded bg-kindra-200" /></div>
          </div>)}
        </div> : loadError ? <Card className="exercise-empty" role="alert">
          <RotateCcw size={28} className="text-kindra-500" aria-hidden="true" />
          <h2>O catálogo não carregou</h2><p>{loadError}</p>
          <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button>
        </Card> : filteredExercises.length === 0 ? <Card className="exercise-empty">
          {exercises.length ? <Search size={28} className="text-kindra-500" aria-hidden="true" /> : <Dumbbell size={28} className="text-kindra-500" aria-hidden="true" />}
          <h2>{!exercises.length ? 'O catálogo ainda está vazio' : hasSearch ? 'Nenhum exercício com esse nome' : 'Nenhum exercício para esses filtros'}</h2>
          <p>{!exercises.length ? 'Os exercícios aparecerão aqui quando estiverem disponíveis.' : hasSearch ? 'Tente outro nome ou revise os filtros selecionados.' : 'Experimente outro grupo muscular ou equipamento.'}</p>
          {exercises.length > 0 && <Button variant="outline" onClick={() => { setSearchQuery(''); setFilters(emptyExerciseFilters); }}>Ver todos os exercícios</Button>}
        </Card> : <div className="exercise-grid">
          {filteredExercises.map(exercise => <div key={exercise.id} className="min-w-0">
            <ExerciseCard exercise={exercise} selected={selectedIds.has(exercise.id)} onToggle={() => toggleSelection(exercise.id)} />
          </div>)}
        </div>}
      </section>

      {selectedIds.size > 0 && <div className="exercise-selection-bar">
        <div className="flex min-w-0 items-center gap-3">
          <span className="exercise-filter-count"><Check size={16} aria-hidden="true" /></span>
          <span className="text-sm font-medium" role="status">{selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="w-11 px-0" aria-label="Limpar seleção" onClick={() => setSelectedIds(new Set())}><X size={18} aria-hidden="true" /></Button>
          {/* Preserve the existing confirmation contract: return to the previous page. */}
          <Button onClick={() => navigate(-1)}>Adicionar <span className="hidden sm:inline">{selectedIds.size} exercício{selectedIds.size === 1 ? '' : 's'}</span></Button>
        </div>
      </div>}

      {filtersOpen && <MuscleFilterSheet exercises={exercises} query={searchQuery} value={filters}
        onClose={() => setFiltersOpen(false)} onApply={value => { setFilters(value); setFiltersOpen(false); }} />}
    </div>
  );
}
