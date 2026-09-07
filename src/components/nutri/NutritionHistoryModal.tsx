import { useEffect, useState } from 'react';
import { X, Calendar, CheckCircle2, XCircle, Droplet } from 'lucide-react';
import { getNutritionHistory, NutritionHistory } from '../../lib/nutrition';

interface NutritionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NutritionHistoryModal({ isOpen, onClose }: NutritionHistoryModalProps) {
  const [history, setHistory] = useState<NutritionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  async function loadHistory() {
    setIsLoading(true);
    try {
      const response = await getNutritionHistory();
      // The modal only needs the array to display the log list
      setHistory(response.history);
    } catch (error) {
      console.error('Erro ao buscar histórico', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md">
      <div 
        className="bg-kindra-100 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-kindra-200/50 flex flex-col max-h-[85vh] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-8 pt-8 pb-6 bg-kindra-100">
          <h2 className="text-2xl font-display font-semibold text-kindra-950 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-kindra-200/50 flex items-center justify-center border border-kindra-300/30">
              <Calendar className="h-5 w-5 text-kindra-900" />
            </div>
            Histórico Diário
          </h2>
          <button 
            onClick={onClose}
            className="p-2.5 text-kindra-400 hover:text-kindra-950 hover:bg-kindra-200/50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-kindra-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-8 pb-8 overflow-y-auto custom-scrollbar flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kindra-500 mb-4"></div>
              <p className="text-sm font-medium text-kindra-400">Buscando registros...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-kindra-200/30 rounded-3xl border border-kindra-300/30 border-dashed">
              <div className="h-16 w-16 bg-kindra-200/50 rounded-full flex items-center justify-center mb-4 border border-kindra-300/30">
                <Calendar className="h-7 w-7 text-kindra-900" />
              </div>
              <h3 className="text-lg font-semibold text-kindra-950 mb-1">Nenhum registro ainda</h3>
              <p className="text-sm text-kindra-400 max-w-[240px] leading-relaxed">
                Seus dados consolidados diários aparecerão aqui automaticamente após a meia-noite.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((day) => {
                const dateObj = new Date(day.date);
                // Compensar timezone se necessário, mas como date-fns gravou UTC puro à meia-noite, usar toLocaleDateString com timezone UTC é seguro
                const dateStr = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
                
                return (
                  <div key={day.id} className="bg-kindra-200/30 rounded-[24px] p-6 border border-kindra-300/30 shadow-sm hover:bg-kindra-200/50 transition-colors group">
                    <div className="flex justify-between items-center mb-5">
                      <span className="font-display font-semibold text-kindra-950 capitalize text-lg tracking-tight">{dateStr}</span>
                      {day.waterGoalAchieved ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-3 py-1.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          CONCLUÍDO
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-rose-400 bg-rose-950/30 border border-rose-900/50 px-3 py-1.5 rounded-full">
                          <XCircle className="h-3.5 w-3.5 text-rose-500" />
                          FALHOU
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-kindra-100/50 rounded-2xl p-4 border border-kindra-200/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-kindra-400 uppercase tracking-wider mb-2">
                          <Droplet className="h-3.5 w-3.5 text-blue-400" />
                          Água
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-display font-bold text-kindra-950 tracking-tight">{day.waterIngestedMl}</span>
                          <span className="text-sm font-medium text-kindra-500">/ {day.targetWaterMl} ml</span>
                        </div>
                      </div>
                      
                      {/* Espaço para futuras calorias */}
                      <div className="bg-kindra-100/50 rounded-2xl p-4 border border-kindra-200/30 opacity-60 grayscale">
                        <div className="flex items-center gap-2 text-xs font-semibold text-kindra-400 uppercase tracking-wider mb-2">
                          <span className="text-orange-400 text-[14px] leading-none">🔥</span>
                          Kcal
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-display font-bold text-kindra-950 tracking-tight">-</span>
                          <span className="text-sm font-medium text-kindra-500">/ {day.targetKcal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
