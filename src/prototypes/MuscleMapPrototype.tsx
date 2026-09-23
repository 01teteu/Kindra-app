import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import catalog from '../../prisma/seed-data/exercises.json';
import { MuscleMap } from '../components/workout/MuscleMap';
import { Button } from '../components/ui/Button';
import '../index.css';
import './muscle-map-prototype.css';

// Read-only catalog data. This entry is separate from the application router/build entry.
const pilotSlugs = ['supino-reto-barra', 'rosca-direta-barra', 'agachamento-livre-barra'];
const pilots = pilotSlugs.map(slug => {
  const exercise = catalog.find(item => item.slug === slug);
  if (!exercise) throw new Error(`Exercício piloto ausente: ${slug}`);
  return exercise;
});

function MuscleMapPrototype() {
  const [selected, setSelected] = useState(pilotSlugs[0]);
  const exercise = pilots.find(item => item.slug === selected)!;
  return <main className="muscle-prototype">
    <header className="muscle-prototype-header"><span className="muscle-prototype-brand">kindra</span><span>Protótipo · Mapa muscular</span></header>
    <div className="muscle-prototype-heading"><h1>Conheça os músculos do seu treino.</h1>
      <p>Veja o grupo principal e os músculos secundários de cada exercício.</p></div>
    <nav className="muscle-prototype-selector" aria-label="Exercícios piloto">
      {pilots.map(item => <Button key={item.slug} variant={selected === item.slug ? 'secondary' : 'ghost'}
        aria-pressed={selected === item.slug} onClick={() => setSelected(item.slug)} data-pilot={item.slug}>
        {item.name}
      </Button>)}
    </nav>
    <p className="sr-only" role="status">Exercício exibido: {exercise.name}</p>
    <MuscleMap exerciseName={exercise.name} primaryMuscle={exercise.primaryMuscle}
      secondaryMuscles={exercise.secondaryMuscles} muscleRegion={exercise.muscleRegion} />
    <footer className="muscle-prototype-footer"><span>Estudo visual isolado · Dados do catálogo Kindra</span>
      <a href="/src/components/workout/MUSCLE_MAP_LICENSES.md" target="_blank" rel="noreferrer">Geometria e créditos MIT</a></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<MuscleMapPrototype />);
