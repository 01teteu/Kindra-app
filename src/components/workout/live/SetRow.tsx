import { useState, useId, useRef, useLayoutEffect, useEffect, useSyncExternalStore } from 'react';
import { Check, Plus, Minus, ChevronDown, Star } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { parseMetric, type LiveSet, type SetType } from './model';
import type { LiveWorkoutStore } from './state';

export function NumericField({ value, integer = false, label, disabled, onChange, onSave, store, editKey }: {
  value: number | null; integer?: boolean; label: string; disabled?: boolean;
  onChange?: (value: number | null) => void; onSave?: (value: number | null) => Promise<boolean>;
  store?: LiveWorkoutStore; editKey?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));
  const [failed, setFailed] = useState(false);
  const currentText = useRef(text);
  const dirty = useRef(false);
  const submitting = useRef<string | null>(null);
  const invalid = text !== '' && parseMetric(text, integer) === null;
  useEffect(() => {
    if (!dirty.current) {
      const next = value === null ? '' : String(value).replace('.', ',');
      currentText.current = next; setText(next);
    }
  }, [value]);
  useEffect(() => () => { if (editKey) store?.dirty(editKey, false); }, [store, editKey]);
  const commit = async () => {
    const submitted = currentText.current;
    const number = parseMetric(submitted, integer);
    if (!dirty.current || submitting.current === submitted || (submitted !== '' && number === null)) return;
    if (!onSave) return;
    submitting.current = submitted;
    const saved = await onSave(number);
    if (submitting.current === submitted) submitting.current = null;
    if (currentText.current !== submitted) return;
    setFailed(!saved);
    if (saved) {
      dirty.current = false;
      if (editKey) store?.dirty(editKey, false);
      const next = number === null ? '' : String(number).replace('.', ',');
      currentText.current = next; setText(next);
    }
  };
  return <><Input type="text" inputMode={integer ? 'numeric' : 'decimal'} aria-label={label} disabled={disabled}
    value={text} placeholder="—" aria-invalid={invalid || failed}
    onChange={event => {
      const next = event.target.value; currentText.current = next; setText(next); setFailed(false);
      const parsed = parseMetric(next, integer);
      dirty.current = submitting.current !== null || (next !== '' && parsed === null) || parsed !== value;
      if (editKey) store?.dirty(editKey, dirty.current);
      onChange?.(parsed);
    }}
    onBlur={() => { void commit(); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
    className={`live-number${invalid || failed ? ' input-error' : ''}`} />
    {failed && <span role="alert" className="live-field-error">Não salvo. Tente novamente ao sair do campo.</span>}
  </>;
}
const labels: Record<SetType, string> = { WORKING: 'Série válida', WARMUP: 'Aquecimento', DROP_SET: 'Drop set' };
export function SetRow({ set, number, disabled, isNext, store, base, previous = '—' }: {
  set: LiveSet; number: number; disabled: boolean; isNext: boolean; store: LiveWorkoutStore; base: string; previous?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const menuId = useId();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = (restoreFocus = false) => {
    if (menuRef.current) {
      menuRef.current.open = false;
      if (restoreFocus) menuRef.current.querySelector('summary')?.focus({ preventScroll:true });
    }
    setMenuOpen(false);
  };
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current!;
    const panel = panelRef.current!;
    const position = () => {
      const anchor = menu.querySelector('summary')!.getBoundingClientRect();
      const margin = 8;
      const below = Math.max(0, window.innerHeight - anchor.bottom - margin * 2);
      const above = Math.max(0, anchor.top - margin * 2);
      const height = panel.scrollHeight + 2;
      const opensBelow = below >= height || below >= above;
      panel.style.maxHeight = `${opensBelow ? below : above}px`;
      panel.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - panel.offsetWidth - margin))}px`;
      panel.style.top = `${opensBelow ? anchor.bottom + margin : Math.max(margin, anchor.top - panel.offsetHeight - margin)}px`;
    };
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
        setMenuOpen(false);
      }
    };
    position();
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [menuOpen]);
  const completed = Boolean(set.completedAt);
  const records = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).personalRecords;
  const achievement = completed && set.type === 'WORKING' ? records[set.id] : undefined;
  const name = set.type === 'WORKING' ? `Série ${number}` : `${labels[set.type]} ${set.setNumber}`;
  const path = `${base}/sets/${set.id}`;
  const busy = store.getSnapshot().pending.some(key => key.startsWith(set.id));
  const newKey = `${set.id}:new`;
  useEffect(() => () => store.dirty(newKey, false), [store, newKey]);
  const save = (field: 'weight' | 'reps', value: number | null, segmentId?: string) =>
    store.mutate(`${set.id}:${segmentId ?? ''}:${field}`, segmentId ? `${path}/segments/${segmentId}` : path, 'PATCH', { [field]: value });
  const changeType = (type: SetType) => {
    void store.mutate(set.id, path, 'PATCH', { type });
  };
  const removeSegment = (index: number) => {
    const segment = set.segments[index];
    if (window.confirm('Remover este segmento preenchido?')) void store.mutate(set.id, `${path}/segments/${segment.id}`, 'DELETE');
  };
  return <div className={`live-set${isNext ? ' is-next' : ''}${completed ? ' is-completed' : ''}${achievement ? ' is-pr' : ''}${set.type === 'DROP_SET' ? ' is-drop' : ''}`} data-set-type={set.type} aria-current={isNext ? 'step' : undefined}>
    {isNext && <span className="sr-only">Próxima série</span>}
    <div className="live-set-grid">
      <div className="live-set-identity">
        <details ref={menuRef} className="live-menu live-set-menu" onToggle={event => setMenuOpen(event.currentTarget.open)} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
        }}>
          <summary aria-label={`Opções de ${name}`} aria-controls={menuId} title={labels[set.type]}>
            <span>{set.type === 'WORKING' ? number : set.type === 'WARMUP' ? 'W' : 'D'}</span><ChevronDown size={12} aria-hidden="true" />
          </summary>
          <div ref={panelRef} id={menuId} className="live-menu-panel">
            <label>Tipo da série<select aria-label={`Tipo de ${name}`} className="kindra-input" value={set.type} disabled={disabled || completed || busy || set.type === 'DROP_SET'}
              onChange={event => { changeType(event.target.value as SetType); closeMenu(true); }}>
              <option value="WORKING">Série válida</option><option value="WARMUP">Aquecimento</option><option value="DROP_SET" disabled>Drop set</option>
            </select></label>
            {set.type === 'DROP_SET' && <p>Para outro tipo, adicione uma nova série.</p>}
            {set.type === 'DROP_SET' && !completed && !disabled && set.segments.length > 0 && <button type="button" disabled={busy}
              aria-label={`Remover segmento 1 de ${name}`} onClick={() => removeSegment(0)}>Remover primeiro segmento</button>}
            {completed && !disabled && <p>Reabra a série para editar.</p>}
            <button type="button" disabled={disabled || busy} onClick={() => {
              if (window.confirm(set.type === 'DROP_SET' ? `Remover este drop set e seus ${set.segments.length} segmentos?` : 'Remover esta série?')) void store.mutate(set.id, path, 'DELETE');
            }}>Remover {set.type === 'DROP_SET' ? 'drop e segmentos' : 'série'}</button>
          </div>
        </details>
      </div>
      <div className="live-previous" aria-label={`Anterior de ${name}`}><span className="live-mobile-label">Anterior</span><span className="live-previous-value" title={previous}>{previous}</span></div>
      {set.type !== 'DROP_SET' ? <>
        <div><NumericField label={`Carga de ${name} em kg`} value={set.weight} disabled={disabled || completed} store={store} editKey={`${set.id}:weight`} onSave={value => save('weight', value)} /></div>
        <div><NumericField label={`Repetições de ${name}`} value={set.reps} integer disabled={disabled || completed} store={store} editKey={`${set.id}:reps`} onSave={value => save('reps', value)} /></div>
      </> : <div className="live-segments">
        {set.segments.map((segment, index) => <div key={segment.id} className="live-segment">
          <span className="live-segment-index" aria-hidden="true">{index === 0 ? '' : '↳'}</span>
          <NumericField label={`Carga do segmento ${index + 1} de ${name} em kg`} value={segment.weight} disabled={disabled || completed}
            store={store} editKey={`${set.id}:${segment.id}:weight`} onSave={value => save('weight', value, segment.id)} />
          <NumericField label={`Repetições do segmento ${index + 1} de ${name}`} integer value={segment.reps} disabled={disabled || completed}
            store={store} editKey={`${set.id}:${segment.id}:reps`} onSave={value => save('reps', value, segment.id)} />
          {index > 0 && !disabled && !completed && <button type="button" className="live-remove-segment" disabled={busy} aria-label={`Remover segmento ${index + 1} de ${name}`}
            onClick={() => removeSegment(index)}><Minus size={14} /></button>}
        </div>)}
        {!completed && !disabled && (adding ? <div className="live-segment-draft">
          <p className="live-set-caption">Novo segmento · ainda não salvo</p>
          <div className="live-segment">
            <span aria-hidden="true">↳</span>
            <NumericField label={`Carga do novo segmento de ${name} em kg`} value={weight} onChange={setWeight} />
            <NumericField label={`Repetições do novo segmento de ${name}`} value={reps} integer onChange={setReps} />
          </div>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || weight === null || reps === null} onClick={async () => {
            if (await store.mutate(set.id, `${path}/segments`, 'POST', { weight, reps })) {
              store.dirty(newKey, false); setAdding(false); setWeight(null); setReps(null);
            }
          }}>Salvar segmento</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAdding(false); setWeight(null); setReps(null); store.dirty(newKey, false); }}>Cancelar segmento</Button></div>
        </div> : <button type="button" className="live-add-segment" disabled={busy} onClick={() => { setAdding(true); store.dirty(newKey, true); }}>
          <Plus size={14} aria-hidden="true" /> Segmento
        </button>)}
      </div>}
      <button type="button" className="live-complete" aria-label={`${completed ? 'Reabrir' : 'Concluir'} ${name}`} aria-pressed={completed} disabled={disabled || busy}
        onClick={() => { void store.mutate(set.id, `${path}/completion`, 'PATCH', { completed: !completed }, set.id); }}>
        {completed ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : <span className="live-check-ring" aria-hidden="true" />}
      </button>
    </div>
    {achievement && <div className="live-pr" role="status" aria-atomic="true"><Star size={18} aria-hidden="true" /><div><strong>Novo PR</strong><span>e1RM {achievement.currentValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</span></div></div>}
    {set.type === 'WARMUP' && <p className="live-set-caption">Aquecimento<span className="sr-only"> · fora do volume principal</span></p>}
    {set.type === 'DROP_SET' && <p className="live-set-caption">Drop set · {set.segments.length} etapas{completed ? ' · concluída' : ''}</p>}
  </div>;
}
