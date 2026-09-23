import { useEffect, useId, useRef, useState } from 'react';
import type { ProgressMetric } from '../../../shared/workoutProgress';

export const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
export const dateLabel = (date: string) => { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; };
export const metricText = (metric: ProgressMetric) => metric.status === 'available' ? `${formatNumber(metric.value)} kg` : metric.status === 'incomplete' ? 'Dados incompletos' : 'Sem dados elegíveis';
export type ChartDatum = { id: string; date: string; label: string; metric: ProgressMetric };

export function ProgressChart({ data, kind, label }: { data: ChartDatum[]; kind: 'volume' | 'estimate'; label: string }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(260, entries[0].contentRect.width)));
    if (wrapper.current) observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActive(null), [data]);
  const height = kind === 'estimate' ? (width < 600 ? 260 : 310) : 200;
  const left = 62, right = 14, top = 16, bottom = 36;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.flatMap(item => item.metric.status === 'available' ? [item.metric.value] : []));
  // Calendar coordinates only for drawing; query boundaries are resolved by the API.
  const calendar = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const positions = data.map((item, index) => kind === 'volume' ? calendar(item.date) : index);
  const first = positions[0] ?? 0, last = positions.at(-1) ?? first;
  const x = (index: number) => left + (last === first ? plotWidth / 2 : 12 + (positions[index] - first) / (last - first) * (plotWidth - 24));
  const y = (value: number) => top + plotHeight * (1 - value / max);
  const selected = active === null ? null : data[active];
  const tickIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter(index => index >= 0);
  const barWidth = Math.max(2, Math.min(26, plotWidth / Math.max(data.length, last > first && kind === 'volume' ? (last - first) / 86400000 + 1 : 1) * .6));
  let path = '';
  let connected = false;
  data.forEach((item, index) => {
    if (item.metric.status !== 'available') { connected = false; return; }
    path += `${connected ? 'L' : 'M'}${x(index)},${y(item.metric.value)} `;
    connected = true;
  });
  return <div ref={wrapper} className={`progress-chart progress-chart-${kind}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={data.length ? 0 : undefined}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !data.length) return;
        event.preventDefault();
        setActive(current => event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : Math.max(0, Math.min(data.length - 1, (current ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
      <title id={`${id}-title`}>{label}</title>
      <desc id={`${id}-help`}>Use as setas para consultar os valores ou abra Ver dados abaixo. Valores ausentes não representam zero.</desc>
      {[0, .5, 1].map(fraction => <g key={fraction} aria-hidden="true">
        <line x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} className="progress-gridline" />
        <text x={left - 10} y={y(max * fraction) + 4} textAnchor="end">{new Intl.NumberFormat('pt-BR', { notation: max > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(max * fraction)}</text>
      </g>)}
      {kind === 'estimate' && <path d={path} className="progress-line" aria-hidden="true" />}
      {data.map((item, index) => <g key={item.id} onClick={() => setActive(index)} onMouseEnter={() => setActive(index)} aria-hidden="true">
        <rect x={x(index) - Math.max(10, barWidth / 2)} y={top} width={Math.max(20, barWidth)} height={plotHeight + 10} fill="transparent" />
        {item.metric.status === 'available' ? kind === 'volume' && item.metric.value > 0
          ? <rect x={x(index) - barWidth / 2} y={y(item.metric.value)} width={barWidth} height={height - bottom - y(item.metric.value)} rx="2" className={`progress-bar${active === index ? ' is-selected' : ''}`} />
          : <circle cx={x(index)} cy={y(item.metric.value)} r={active === index ? 5 : 3.5} className="progress-point" />
          : <path d={`M${x(index) - 3},${y(0) - 3}l6,6m0,-6l-6,6`} className="progress-missing" />}
      </g>)}
      {tickIndexes.map(index => <text key={index} x={x(index)} y={height - 10} textAnchor="middle" aria-hidden="true">{data[index].date.slice(8)}/{data[index].date.slice(5, 7)}</text>)}
    </svg>
    <div className="progress-chart-readout" aria-live="polite">{selected ? <><span>{selected.label}</span><strong data-status={selected.metric.status}>{metricText(selected.metric)}</strong></> : <span>Toque em um ponto ou use as setas para consultar os valores.</span>}</div>
    <details className="progress-data"><summary>Ver dados</summary><div className="progress-data-scroll"><table><caption>{label}</caption><thead><tr><th scope="col">Registro</th><th scope="col">Carga (kg)</th></tr></thead><tbody>{data.map(item => <tr key={item.id}><th scope="row">{item.label}</th><td>{metricText(item.metric)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
