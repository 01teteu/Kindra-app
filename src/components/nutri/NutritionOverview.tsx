import { Info, Flame } from 'lucide-react';
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
  const remainingProtein = targetProteinG - consumed.proteinG;
  const remainingCarbs = targetCarbsG - consumed.carbsG;
  const remainingFat = targetFatG - consumed.fatG;

  const macros = [
    { label: 'Proteínas', remaining: remainingProtein },
    { label: 'Carboidratos', remaining: remainingCarbs },
    { label: 'Gorduras', remaining: remainingFat },
  ];
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="eyebrow">Balanço do dia</span>
          <h2 className="text-lg font-semibold mt-1">Sua meta diária</h2>
        </div>
        <Flame size={22} className="text-teal-300" aria-hidden="true" />
      </div>
      <div className="flex items-baseline flex-wrap gap-2">
        <span className="metric-number">{remainingKcal.toFixed(0)}</span>
        <span className="text-sm text-kindra-500">kcal restantes</span>
      </div>
      <div className="flex justify-between gap-3 text-xs text-kindra-500 mt-5 mb-3">
        <span>{consumed.kcal.toFixed(0)} consumidas</span>
        <span>Meta: {targetKcal.toFixed(0)}</span>
      </div>
      <div className="metric-rail" aria-hidden="true">
        <span
          style={{
            width: `${targetKcal > 0 ? Math.min(100, Math.max(0, (consumed.kcal / targetKcal) * 100)) : 0}%`,
          }}
        />
      </div>
      <div className="macro-grid">
        {macros.map((macro) => (
          <div key={macro.label}>
            <p>{macro.label}</p>
            <strong>
              {macro.remaining.toFixed(1)}
              <small>g</small>
            </strong>
            <span className="block text-[10px] text-kindra-500 mt-1">restantes</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
