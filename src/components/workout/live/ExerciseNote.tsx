import { useState, useId, useEffect } from 'react';
import { MessageSquarePlus, Pencil } from 'lucide-react';
import { Button } from '../../ui/Button';
import { NOTE_LIMIT } from './model';
import type { LiveWorkoutStore } from './state';

export function ExerciseNote({ notes, disabled, store, base, exerciseId }: {
  notes: string | null; disabled: boolean; store: LiveWorkoutStore; base: string; exerciseId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const inputId = useId();
  const key = `${exerciseId}:notes`;
  const busy = store.getSnapshot().pending.includes(key);
  useEffect(() => () => store.dirty(key, false), [store, key]);
  const save = async (value: string | null) => {
    if (await store.mutate(key, base, 'PATCH', { notes: value })) {
      store.dirty(key, false); setEditing(false);
    }
  };
  const edit = () => { setDraft(notes ?? ''); setEditing(true); };
  return <div className="live-note">
    {editing && !disabled ? <div className="live-note-editor">
      <label htmlFor={inputId}>Nota de hoje</label>
      <textarea id={inputId} className="kindra-input" rows={2} maxLength={NOTE_LIMIT} autoFocus value={draft} disabled={busy}
        placeholder="Registre um ajuste de técnica ou carga…" onChange={event => { setDraft(event.target.value); store.dirty(key, event.target.value.trim() !== (notes ?? '')); }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-kindra-500">{draft.length}/{NOTE_LIMIT}{store.getSnapshot().dirty.includes(key) ? ' · não salva' : ''}</span>
        <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={busy} className="live-note-action" onClick={() => { void save(null); }}>Remover nota</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void save(draft.trim() || null); }}>Pronto</Button></div>
      </div>
    </div> : notes ? <div className="live-note-saved"><div><span className="text-xs text-kindra-500">Nota de hoje</span><p>{notes}</p></div>
      {!disabled && <Button type="button" size="sm" variant="ghost" className="live-note-action live-note-edit" aria-label="Editar nota" onClick={edit}><Pencil size={16} aria-hidden="true" /></Button>}</div>
      : !disabled && <Button type="button" size="sm" variant="ghost" className="live-note-add live-note-action" onClick={edit}><MessageSquarePlus size={16} aria-hidden="true" />Adicionar nota</Button>}
  </div>;
}
