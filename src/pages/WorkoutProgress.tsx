import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { createProgressStore, presetRange, validRange, type Preset } from '../components/workout/progress/state';
import { ProgressChart, dateLabel, formatNumber, metricText } from '../components/workout/progress/ProgressCharts';
import type { ProgressExercise, ProgressMetric } from '../shared/workoutProgress';
import './workout-progress.css';

function Metric({ value }: { value: ProgressMetric }) {
  return <span className={`progress-metric progress-metric-${value.status}`}>{metricText(value)}</span>;
}
function RecordComparison({ exercise }: { exercise: ProgressExercise }) {
  return <div className="progress-record-comparison">
    <div className="progress-record-head"><span /><span>No período</span><span>Todo o histórico</span></div>
    <div><strong>Maior carga</strong><Metric value={exercise.periodRecords.maxWeight} /><Metric value={exercise.allTimeRecords.maxWeight} /></div>
    <div><strong>Melhor e1RM</strong><Metric value={exercise.periodRecords.bestEstimatedOneRepMax} /><Metric value={exercise.allTimeRecords.bestEstimatedOneRepMax} /></div>
    {[exercise.periodRecords.maxWeight, exercise.periodRecords.bestEstimatedOneRepMax, exercise.allTimeRecords.maxWeight, exercise.allTimeRecords.bestEstimatedOneRepMax].some(metric => metric.status === 'incomplete') && <p className="progress-note">Não foi possível calcular esta marca com todos os registros.</p>}
  </div>;
}

export function WorkoutProgress() {
  const [store] = useState(() => createProgressStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [preset, setPreset] = useState<Preset>('month');
  const [draft, setDraft] = useState(state.range);
  const [dateError, setDateError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const exerciseSelect = useRef<HTMLSelectElement>(null);
  const navigate = useNavigate();
  useEffect(() => { void store.load(); return store.dispose; }, [store]);
  useEffect(() => { if (state.authExpired) navigate('/login'); }, [state.authExpired, navigate]);
  const data = state.data;
  const selected = data?.exercises.find(exercise => exercise.exerciseId === state.selectedId);
  const choosePreset = (value: Preset) => {
    setPreset(value); setDateError('');
    if (value !== 'custom') { const range = presetRange(value); setDraft(range); void store.load(range); }
  };
  const selectExercise = (id: string) => { void store.select(id); };
  return <div className="page-container workout-progress">
    <header className="progress-heading">
      <Link className="progress-back" to="/workout"><ArrowLeft size={16} aria-hidden="true" /> Voltar para Treinos</Link>
      <h1>Sua evolução</h1>
    </header>
    <section className="progress-hero" aria-label="Seu esforço acumulado" data-status={data?.period.volume.status ?? 'loading'}>
      <div className="progress-hero-main">
        <div className="progress-hero-copy"><h2>Cada treino <br />conta.</h2><p>Acompanhe seu progresso<br className="progress-desktop-break" /> ao longo do tempo.</p></div>
        {data && <div className="progress-summary" aria-label="Resumo do período">
          <h3>Carga movimentada no período</h3>
          {data.period.volume.status === 'available' ? <p className="progress-total" data-long={formatNumber(data.period.volume.value).length > 9}>{formatNumber(data.period.volume.value)} <span>kg</span></p> : <p className="progress-summary-empty">{metricText(data.period.volume)}</p>}
          <p className="progress-training-count"><strong className="progress-session-count">{formatNumber(data.period.sessionCount)}</strong> {data.period.sessionCount === 1 ? 'treino concluído' : 'treinos concluídos'}</p>
          {data.period.volume.status === 'incomplete' && <p className="progress-note">Não foi possível calcular o volume com todos os registros.</p>}
          {data.period.volume.status === 'no_data' && <p className="progress-note">Ainda não há contribuições elegíveis de carga neste período.</p>}
        </div>}
        {state.loading && <div className="progress-loading" role="status" aria-busy="true"><span />Carregando sua evolução…</div>}
      </div>
    <section className="progress-filters" aria-label="Período da evolução">
      <div className="progress-presets">{([['month', 'Mês atual'], ['previous', 'Mês anterior'], ['30days', 'Últimos 30 dias'], ['custom', 'Personalizado']] as const).map(([value, label]) => <Button key={value} variant={preset === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={preset === value} onClick={() => choosePreset(value)}>{label}</Button>)}</div>
      {preset === 'custom' && <form className="progress-custom" onSubmit={event => {
        event.preventDefault(); if (!validRange(draft)) { setDateError('Informe datas válidas, com o início anterior ou igual ao fim.'); return; }
        setDateError(''); void store.load(draft);
      }}>
        <Input type="date" title="Data inicial" value={draft.startDate} required onChange={event => setDraft({ ...draft, startDate: event.target.value })} />
        <Input type="date" title="Data final" value={draft.endDate} required onChange={event => setDraft({ ...draft, endDate: event.target.value })} aria-describedby={dateError ? 'progress-date-error' : undefined} />
        <Button type="submit" isLoading={state.loading}>Aplicar</Button>
        {dateError && <p role="alert" id="progress-date-error">{dateError}</p>}
      </form>}
      <p className="progress-period-label">{dateLabel(state.range.startDate)} — {dateLabel(state.range.endDate)} <span>Horário de {state.timeZone || 'fuso indisponível'}</span></p>
    </section>
    </section>



    {state.error && <div className="progress-error" role="alert"><p>{state.error}</p><Button variant="outline" onClick={() => state.timeZone ? void store.load() : window.location.reload()}>Tentar novamente</Button></div>}
    {data && <>
      {!data.period.sessionCount && <p className="progress-notice">Nenhum treino concluído neste período. Experimente outro intervalo. Suas marcas históricas continuam disponíveis abaixo.</p>}
      <div className="progress-detail-grid">
        <section className="progress-exercise-panel" aria-labelledby="progress-exercise-heading">
          <div className="progress-section-heading"><div><p className="progress-section-context">Sua trajetória</p><h2 id="progress-exercise-heading">Sua força, sessão a sessão</h2></div><span>e1RM · kg</span></div>
          <div className="progress-exercise-control"><label className="progress-select-label" htmlFor="progress-exercise">Exercício</label>
          <select id="progress-exercise" className="kindra-input" ref={exerciseSelect} value={state.selectedId} disabled={!data.exercises.length} onChange={event => selectExercise(event.target.value)}>
            {!data.exercises.length && <option value="">Nenhum exercício no histórico</option>}
            {data.exercises.map(exercise => <option key={exercise.exerciseId} value={exercise.exerciseId}>{exercise.name}</option>)}
          </select></div>
          <p className="progress-description">Melhor e1RM por sessão: estimativa de uma repetição máxima a partir das séries elegíveis. Não representa um teste real de 1RM.</p>
          {!data.exercises.length ? <p className="progress-empty">Conclua um treino com exercícios para começar a acompanhar sua evolução.</p>
            : state.detailLoading ? <p className="progress-empty" role="status">Carregando a progressão…</p>
            : state.detailError ? <div className="progress-error" role="alert"><p>{state.detailError}</p><Button variant="outline" onClick={() => selectExercise(state.selectedId)}>Tentar novamente</Button></div>
            : <>
              {state.points.length ? <ProgressChart kind="estimate" label={`e1RM por sessão — ${selected?.name ?? ''}`} data={state.points.map((point, index) => ({ id: point.sessionId, date: point.localDate, label: `${dateLabel(point.localDate)} · sessão ${index + 1}`, metric: point.bestEstimatedOneRepMax }))} /> : <p className="progress-empty">Este exercício não tem sessões no período selecionado.</p>}
              {state.points.length > 0 && !state.points.some(point => point.bestEstimatedOneRepMax.status === 'available') && <p className="progress-note">{state.points.some(point => point.bestEstimatedOneRepMax.status === 'incomplete') ? 'Não foi possível estimar o e1RM com todos os registros.' : state.nextCursor ? 'Sem estimativa nas sessões carregadas.' : 'Não há séries elegíveis para estimar o e1RM neste período.'}</p>}
              {state.points.some(point => point.bestEstimatedOneRepMax.status === 'incomplete') && state.points.some(point => point.bestEstimatedOneRepMax.status === 'available') && <p className="progress-note">Algumas sessões têm dados incompletos; as estimativas disponíveis continuam visíveis.</p>}
              {state.points.length > 0 && <p className="progress-pagination-note" role="status">{state.nextCursor ? `Exibindo ${state.points.length} sessões carregadas. Ainda há sessões para consultar.` : `${state.points.length} ${state.points.length === 1 ? 'sessão no período' : 'sessões no período'} · Todas carregadas.`}</p>}
              {state.moreError && <p role="alert" className="progress-note">{state.moreError}</p>}
              {state.nextCursor && <Button variant="outline" isLoading={state.moreLoading} onClick={() => void store.more()}>{state.moreError ? 'Tentar carregar mais novamente' : 'Carregar mais sessões'}</Button>}
            </>}
        </section>

        <section className="progress-records-panel" aria-labelledby="progress-records-heading">
          <h2 id="progress-records-heading">Suas melhores marcas</h2>
          {selected ? <><p className="progress-selected-name">{selected.name}</p><div className="progress-featured-records">{([
            ['Maior carga', 'maxWeight'], ['Melhor e1RM · estimativa', 'bestEstimatedOneRepMax'],
          ] as const).map(([label, key]) => <article className="progress-personal-best" key={key} data-status={selected.allTimeRecords[key].status}>
            <h3>{label}</h3><p className="progress-best-label">Recorde histórico</p>
            <div className="progress-best-value"><Metric value={selected.allTimeRecords[key]} /></div>
            <div className="progress-period-best"><span>Melhor no período</span><Metric value={selected.periodRecords[key]} /></div>
            {(selected.allTimeRecords[key].status === 'incomplete' || selected.periodRecords[key].status === 'incomplete') && <p className="progress-note">Não foi possível calcular esta marca com todos os registros.</p>}
          </article>)}</div><p className="progress-note">As marcas históricas consideram todo o seu histórico, mesmo fora do período selecionado.</p></> : <p className="progress-empty">As marcas aparecerão quando houver exercícios no seu histórico.</p>}
        </section>
      </div>

      {data.exercises.length > 0 && <section className="progress-all-records">
        <button type="button" className="progress-expand" aria-expanded={expanded} aria-controls="progress-all-records-list" onClick={() => setExpanded(!expanded)}><span>{expanded ? 'Ocultar recordes de todos os exercícios' : 'Ver recordes de todos os exercícios'}<small>{data.exercises.length} {data.exercises.length === 1 ? 'exercício no histórico' : 'exercícios no histórico'}</small></span><ChevronDown size={20} aria-hidden="true" /></button>
        {expanded && <div id="progress-all-records-list">{data.exercises.map(exercise => <article key={exercise.exerciseId} className="progress-record-row"><div><h3>{exercise.name}</h3><Button variant="ghost" size="sm" onClick={() => { selectExercise(exercise.exerciseId); exerciseSelect.current?.focus(); exerciseSelect.current?.scrollIntoView({ block: 'center' }); }}>Ver progressão <ArrowUpRight size={14} aria-hidden="true" /></Button></div><RecordComparison exercise={exercise} /></article>)}</div>}
      </section>}
      <section className="progress-volume-panel" aria-labelledby="progress-volume-heading">
        <div className="progress-section-heading"><h2 id="progress-volume-heading">Seu esforço ao longo dos dias</h2><span>Por dia · kg</span></div>
        <p className="progress-description">Soma da carga × repetições das séries elegíveis, incluindo segmentos concluídos de dropsets e excluindo aquecimentos.</p>
        {data.period.volume.status === 'incomplete' && <p className="progress-notice">Não foi possível calcular o volume com todos os registros. Os dias disponíveis continuam visíveis.</p>}
        {data.period.volumeSeries.length ? <ProgressChart kind="volume" label="Volume diário de treino" data={data.period.volumeSeries.map(day => ({ id: day.localDate, date: day.localDate, label: `${dateLabel(day.localDate)} · ${day.sessionCount} ${day.sessionCount === 1 ? 'sessão' : 'sessões'}`, metric: day.volume }))} /> : <p className="progress-empty">Os dias com treinos concluídos aparecerão aqui.</p>}
        {data.period.sessionCount > 0 && data.period.volume.status === 'no_data' && <p className="progress-note">Há treinos registrados, mas nenhuma contribuição elegível de carga e repetições neste período.</p>}
      </section>

    </>}
  </div>;
}
