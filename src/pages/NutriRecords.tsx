import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MealTracker } from '../components/nutri/MealTracker';
import { getMeals, type Meal } from '../lib/nutrition';
import './nutri.css';

export function NutriRecords() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refreshMeals = useCallback(async () => {
    try {
      setLoadError('');
      setMeals(await getMeals());
    } catch {
      setLoadError('Não foi possível carregar suas refeições. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshMeals(); }, [refreshMeals]);

  return (
    <div className="page-container nutri-page nutri-records-page">
      <header className="nutri-records-heading">
        <Link to="/nutri" className="nutri-back-link" aria-label="Voltar para nutrição"><ArrowLeft size={20} aria-hidden="true" /></Link>
        <div>
          <h1>Registros</h1>
          <p>Seu diário alimentar.</p>
        </div>
      </header>
      {loadError ? (
        <div role="alert" className="kindra-card p-6 text-center">
          <p className="mb-4 text-sm text-kindra-600">{loadError}</p>
          <button type="button" onClick={() => { setIsLoading(true); void refreshMeals(); }} className="kindra-button button-outline">Tentar novamente</button>
        </div>
      ) : (
        <MealTracker meals={meals} isLoading={isLoading} onUpdate={() => { void refreshMeals(); }} />
      )}
    </div>
  );
}
