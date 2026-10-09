import { Info } from 'lucide-react';
import type { NutritionGoal } from '../../lib/nutrition';
import { Card } from '../ui/Card';

export interface ConsumedTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface NutritionOverviewProps {
  goal: NutritionGoal | null;
  consumed: ConsumedTotals;
}

export function NutritionOverview({ goal, consumed }: NutritionOverviewProps) {
  if (!goal) {
    return (
      <Card className="p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-kindra-100 flex items-center justify-center text-kindra-900 mb-2 border border-kindra-200/50">
          <Info className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-kindra-900">Nenhuma meta definida</h3>
        <p className="text-sm text-kindra-500 max-w-sm">
          Acesse o menu no topo da página para calcular suas metas.
        </p>
      </Card>
    );
  }

  const { targetKcal, targetProteinG, targetCarbsG, targetFatG } = goal;

  const remainingKcal = targetKcal - consumed.kcal;
  const macros = [
    { label: 'Proteínas', consumed: consumed.proteinG, target: targetProteinG },
    { label: 'Carboidratos', consumed: consumed.carbsG, target: targetCarbsG },
    { label: 'Gorduras', consumed: consumed.fatG, target: targetFatG },
  ];
  const guardian = new URL('../../assets/nutri/guardian-nutrition.png', import.meta.url).href;
  return (
    <Card className="nutrition-goal-card">
      <div className="nutri-goal-main">
        <span className="eyebrow">Balanço do dia</span>
        <h2>Sua energia<br />de hoje.</h2>
        <div className="nutri-energy-value">
          <strong>{Math.abs(remainingKcal).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
          <span>kcal {remainingKcal >= 0 ? 'restantes' : 'acima da meta'}</span>
        </div>
        <div className="nutri-goal-comparison">
          <span>{consumed.kcal.toFixed(0)} kcal consumidas</span>
          <span>Meta: {targetKcal.toFixed(0)} kcal</span>
        </div>
        <div className="metric-rail" role="meter" aria-label="Progresso de calorias" aria-valuemin={0} aria-valuemax={Math.max(targetKcal, consumed.kcal, 1)} aria-valuenow={consumed.kcal}>
          <span style={{ width: `${targetKcal > 0 ? Math.min(100, Math.max(0, (consumed.kcal / targetKcal) * 100)) : 0}%` }} />
        </div>
        <div className="macro-grid">
          {macros.map((macro) => (
            <div key={macro.label}>
              <p>{macro.label}</p>
              <strong>{macro.consumed.toFixed(0)}<small> / {macro.target.toFixed(0)} g</small></strong>
              <span>{Math.abs(macro.target - macro.consumed).toFixed(1)} g {macro.target >= macro.consumed ? 'restantes' : 'acima da meta'}</span>
            </div>
          ))}
        </div>
      </div>
      <img className="nutri-goal-guardian" src={guardian} width="1254" height="1254" loading="lazy" decoding="async" alt="" aria-hidden="true" />
    </Card>
  );
}
