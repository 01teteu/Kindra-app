import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { muscleLabels, equipmentLabels, type CatalogExercise } from '../../shared/activityOptions';
import { emptyExerciseFilters, filterExercises, muscleSections, type ExerciseFilters } from './exerciseFilters';
import { MuscleVisual } from './ExerciseThumbnail';

export function MuscleFilterSheet({ exercises, query, value, onApply, onClose }: {
  exercises: CatalogExercise[]; query: string; value: ExerciseFilters;
  onApply: (filters: ExerciseFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const available = new Set(exercises.map(ex => ex.primaryMuscle));
  const known = new Set(muscleSections.flatMap(section => section.codes));
  const sections = [...muscleSections, { label: 'Outros grupos', codes: [...available].filter(code => !known.has(code)) }];
  const equipment = [...new Set(exercises.map(ex => ex.equipment))].sort((a, b) =>
    (equipmentLabels[a] ?? a).localeCompare(equipmentLabels[b] ?? b, 'pt-BR'));
  const count = filterExercises(exercises, query, draft).length;

  return (
    <Sheet open onClose={onClose} label="Filtrar exercícios">
      <div className="sheet-panel exercise-filter-panel">
        <div className="flex items-start justify-between gap-4 border-b border-kindra-200 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Filtrar exercícios</h2>
            <p className="mt-2 text-sm text-kindra-500">Escolha os músculos que você quer trabalhar.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar filtros" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain space-y-6 p-5 sm:p-6">
          <p className="text-xs text-kindra-500">Você pode escolher mais de um grupo. Sem seleção, mostramos todos.</p>
          {sections.map(section => {
            const codes = section.codes.filter(code => available.has(code));
            return codes.length > 0 && <fieldset key={section.label}>
              <legend className="mb-3 text-sm font-semibold text-kindra-900">{section.label}</legend>
              <div className="grid grid-cols-2 gap-2">
                {codes.map(code => <label key={code} className="muscle-filter-choice">
                  <input type="checkbox" className="sr-only" checked={draft.muscles.includes(code)}
                    onChange={e => setDraft({ ...draft, muscles: e.target.checked ? [...draft.muscles, code] : draft.muscles.filter(item => item !== code) })} />
                  <span className="h-7 w-7 shrink-0 text-kindra-500" aria-hidden="true"><MuscleVisual muscle={code} /></span>
                  <span className="min-w-0 flex-1 text-xs font-medium">{muscleLabels[code] ?? code}</span>
                  <span className="muscle-filter-check" aria-hidden="true">{draft.muscles.includes(code) && <Check size={13} />}</span>
                </label>)}
              </div>
            </fieldset>;
          })}
          <div>
            <label htmlFor="exercise-equipment" className="mb-3 block text-sm font-semibold">Equipamento</label>
            <select id="exercise-equipment" className="kindra-input w-full" value={draft.equipment}
              onChange={e => setDraft({ ...draft, equipment: e.target.value })}>
              <option value="">Todos os equipamentos</option>
              {equipment.map(code => <option key={code} value={code}>{equipmentLabels[code] ?? code}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-kindra-200 p-5 sm:p-6">
          <Button variant="ghost" onClick={() => setDraft(emptyExerciseFilters)}>Limpar</Button>
          <Button className="flex-1" onClick={() => onApply(draft)}>Ver {count} exercício{count === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Sheet>
  );
}
