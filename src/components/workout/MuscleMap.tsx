import { useId } from 'react';
import { anteriorData, posteriorData } from './muscle-map-geometry';
import { isMuscleRegionVisible, resolveMuscleMap, type MuscleMapData } from './muscle-map-mapping';
import './muscle-map.css';

export function MuscleMap({ compact = false, focused = false, ...data }: MuscleMapData & { compact?: boolean; focused?: boolean }) {
  const uid = useId().replaceAll(':', '');
  const map = resolveMuscleMap(data);
  const hasMappedRegion = map.primaryRegions.size + map.secondaryRegions.size > 0;
  const focus = compact && focused;
  const focusSide = anteriorData.some(part => map.primaryRegions.has(part.muscle) && isMuscleRegionVisible(part.muscle, 'front')) ? 'front' : 'back';
  const focusParts = focusSide === 'front' ? anteriorData : posteriorData;
  const points = focus ? focusParts.filter(part => isMuscleRegionVisible(part.muscle, focusSide) && (map.primaryRegions.has(part.muscle) || map.secondaryRegions.has(part.muscle)))
    .flatMap(part => part.svgPoints.flatMap(polygon => {
      const coords = polygon.split(/\s+/).map(Number);
      return Array.from({ length: coords.length / 2 }, (_, i) => [coords[i * 2], coords[i * 2 + 1]]);
    })) : [];
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  // Frame all highlighted polygons in the chosen view, including a small margin.
  const focusedBox = points.length ? `${Math.min(...xs) - 40} ${Math.min(...ys) - 40} ${Math.max(...xs) - Math.min(...xs) + 80} ${Math.max(...ys) - Math.min(...ys) + 80}` : undefined;
  const views = <div className="muscle-map-views">
        {([{ key: 'front', label: 'Frente', parts: anteriorData, height: 2020 },
          { key: 'back', label: 'Costas', parts: posteriorData, height: 2250 }] as const).filter(view => !focus || view.key === focusSide).map(view => {
          const pattern = `${uid}-${view.key}-secondary`;
          return <div className="muscle-map-view" key={view.key}>
            <span className="muscle-map-view-label">{view.label}</span>
            <svg viewBox={focus ? focusedBox : `-40 -30 1080 ${view.height}`} role="img"
              aria-labelledby={`${uid}-${view.key}-title`} aria-describedby={compact ? undefined : `${uid}-caption`}>
              <title id={`${uid}-${view.key}-title`}>{view.label} — músculos de {data.exerciseName}</title>
              <defs><pattern id={pattern} patternUnits="userSpaceOnUse" width="28" height="28" patternTransform="rotate(35)">
                <rect width="28" height="28" className="muscle-map-secondary-fill" />
                <line x1="0" y1="0" x2="0" y2="28" className="muscle-map-hatch" strokeWidth="7" />
              </pattern></defs>
              {view.parts.map(part => {
                const status = !isMuscleRegionVisible(part.muscle, view.key) ? 'neutral' : map.primaryRegions.has(part.muscle) ? 'primary'
                  : map.secondaryRegions.has(part.muscle) ? 'secondary' : 'neutral';
                return <g key={part.muscle} data-region={part.muscle} data-status={status}
                  className={`muscle-map-region muscle-map-${status}`}
                  fill={status === 'secondary' ? `url(#${pattern})` : undefined}>
                  {part.svgPoints.map((points, index) => <polygon key={index} points={points} />)}
                </g>;
              })}
            </svg>
          </div>;
        })}
      </div>;
  if (compact) return <div className={`muscle-map-compact${focus ? ' muscle-map-focused' : ''}`} aria-hidden="true">{views}</div>;
  return <figure className="muscle-map" aria-labelledby={`${uid}-caption`}>
    <div className="muscle-map-drawing">
      {views}
      <div className="muscle-map-legend" aria-hidden="true">
        <span><i className="muscle-map-swatch-primary" />Principal</span>
        <span><i className="muscle-map-swatch-secondary" />Secundários</span>
      </div>
    </div>
    <figcaption id={`${uid}-caption`} className="muscle-map-details">
      <div className="muscle-map-intro"><p>Músculos trabalhados</p><h2>{data.exerciseName}</h2></div>
      <section className="muscle-map-group" aria-label="Músculo principal">
        <h3><i className="muscle-map-swatch-primary" aria-hidden="true" />Principal</h3>
        <p className="muscle-map-primary-name">{map.primary?.label ?? 'Não informado'}</p>
        {map.primary?.note && <p className="muscle-map-note">{map.primary.note}</p>}
        {map.emphasis && <p className="muscle-map-note">Ênfase cadastrada: {map.emphasis.toLowerCase()}. O mapa representa o grupo geral.</p>}
      </section>
      <section className="muscle-map-group" aria-label="Músculos secundários">
        <h3><i className="muscle-map-swatch-secondary" aria-hidden="true" />Secundários</h3>
        {map.secondary === null ? <p>Não informados.</p>
          : map.secondary.length === 0 ? <p>Nenhum músculo secundário cadastrado.</p>
          : <ul>{map.secondary.map(item => <li key={item.code}><span>{item.label}</span>
            {item.note && <small>{item.note}</small>}</li>)}</ul>}
      </section>
      {!hasMappedRegion && <p className="muscle-map-note">Mapeamento visual indisponível para os dados informados.</p>}
      <p className="muscle-map-footnote">Representação esquemática dos grupos cadastrados. As cores indicam o papel de cada grupo, não a intensidade do esforço.</p>
    </figcaption>
  </figure>;
}
