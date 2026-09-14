import { useEffect, useRef } from 'react';
import { Check, Star } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { LiveSession, PersonalRecord } from './model';
import { completionSummary } from './completion-summary';

export function WorkoutCompletionSummary({ session, records, recordsLoading, recordsError, onRetry, onClose }: {
  session: LiveSession; records: PersonalRecord[]; recordsLoading: boolean; recordsError: string;
  onRetry: () => void; onClose: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (session.status === 'COMPLETED') title.current?.focus(); }, [session.id, session.status]);
  let result: ReturnType<typeof completionSummary>;
  try { result = completionSummary(session, records); }
  catch (error) { return <main className="live-main"><p role="alert">{(error as Error).message}</p><Button onClick={onClose}>Voltar aos treinos</Button></main>; }
  if (!result) return null;
  return <main className="live-main live-completion" aria-labelledby="completed-title">
    <header><Check size={28} className="live-completion-check" aria-hidden="true" />
      <h1 id="completed-title" tabIndex={-1} ref={title}>Treino concluído</h1></header>
    <div className="live-completion-name"><h2>{result.name}</h2><p data-testid="completed-duration">{result.duration}</p></div>
    <dl className="live-completion-counts">
      <div><dt>Exercícios</dt><dd data-testid="completed-exercises">{result.exerciseCount}</dd></div>
      <div><dt>Séries concluídas</dt><dd data-testid="completed-sets">{result.setCount}</dd></div>
    </dl>
    {recordsLoading && <p role="status" className="live-notice">Carregando recordes…</p>}
    {recordsError && <div className="live-notice"><p role="status">{recordsError}</p><Button variant="outline" onClick={onRetry}>Tentar novamente</Button></div>}
    {!recordsLoading && !recordsError && result.records.length > 0 && <section className="live-completion-records" aria-labelledby="completed-records-title">
      <h2 id="completed-records-title">Novos recordes</h2>
      <ul>{result.records.map(record => <li key={record.exerciseId}><Star size={18} aria-hidden="true" />
        <div><h3>{record.name}</h3><p>e1RM {record.currentValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</p></div>
      </li>)}</ul>
    </section>}
    <Button className="live-completion-close" onClick={onClose}>Concluir</Button>
  </main>;
}
