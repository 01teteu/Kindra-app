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

  return (
    <Card className="p-6 relative">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 bg-kindra-900 text-kindra-50 rounded-2xl flex items-center justify-center shadow-lg shadow-black/20 border border-kindra-800">
              <Flame className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl sm:text-2xl font-display font-bold text-kindra-950 tracking-tight leading-tight">
                Meta Diária
              </h2>
              <p className="text-sm font-medium text-kindra-500">Saldo restante do dia</p>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2 mb-8">
          <span className="text-5xl font-display font-bold text-kindra-950 tracking-tight">
            {remainingKcal.toFixed(0)}
          </span>
          <span className="text-lg text-kindra-500 font-medium mb-1">kcal restantes</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-kindra-50/50 rounded-xl p-3 sm:p-4 border border-kindra-100/50 flex flex-col items-center text-center">
            <div className="text-xs font-medium text-kindra-500 mb-1">Proteínas restantes</div>
            <div className="text-lg sm:text-xl font-semibold text-kindra-900">{remainingProtein.toFixed(1)}g</div>
          </div>
          
          <div className="bg-kindra-50/50 rounded-xl p-3 sm:p-4 border border-kindra-100/50 flex flex-col items-center text-center">
            <div className="text-xs font-medium text-kindra-500 mb-1">Carbos restantes</div>
            <div className="text-lg sm:text-xl font-semibold text-kindra-900">{remainingCarbs.toFixed(1)}g</div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-kindra-50/50 rounded-xl p-3 sm:p-4 border border-kindra-100/50 flex flex-col items-center text-center">
            <div className="text-xs font-medium text-kindra-500 mb-1">Gorduras restantes</div>
            <div className="text-lg sm:text-xl font-semibold text-kindra-900">{remainingFat.toFixed(1)}g</div>
          </div>
        </div>
      </Card>
  );
}
