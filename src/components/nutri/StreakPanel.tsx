import { Flame, Check } from 'lucide-react';
import { startOfWeek, addDays, isSameDay, isFuture, parseISO } from 'date-fns';
import type { NutritionHistory } from '../../lib/nutrition';
import { Card } from '../ui/Card';

interface StreakPanelProps {
  streak: number;
  history: NutritionHistory[];
  todayAchieved: boolean;
}

const WEEK_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function StreakPanel({ streak, history, todayAchieved }: StreakPanelProps) {
  const today = new Date();
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 }); // 0 = Domingo
  
  // Se bateu a meta hoje, o usuário ganha +1 visualmente para satisfação imediata
  const displayStreak = streak + (todayAchieved ? 1 : 0);
  const isFireActive = displayStreak > 0;

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(startOfCurrentWeek, i);
    const isDateToday = isSameDay(date, today);
    
    let isCompleted = false;
    if (isDateToday) {
      isCompleted = todayAchieved;
    } else {
      // Procura no histórico se o dia foi batido
      const historyItem = history.find(h => isSameDay(parseISO(h.date), date));
      isCompleted = historyItem ? (historyItem.waterGoalAchieved && historyItem.kcalGoalAchieved && historyItem.proteinGoalAchieved && historyItem.carbsGoalAchieved && historyItem.fatGoalAchieved) : false;
    }

    return {
      label: WEEK_DAYS[i],
      date,
      isCompleted,
      isDateToday,
      isFutureDate: isFuture(date) && !isDateToday
    };
  });

  return (
    <Card className="p-4 mb-6 flex flex-row items-center justify-between overflow-hidden relative shadow-sm border border-kindra-800">
      {/* Glow teal sutil se a ofensiva estiver ativa */}
      {isFireActive && (
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[150px] h-[150px] bg-teal-500/10 blur-2xl rounded-full pointer-events-none" />
      )}

      {/* Esquerda: Fogo + Número compactos */}
      <div className="flex items-center gap-3 z-10 relative">
        <div className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl transition-colors duration-500 ${isFireActive ? 'bg-teal-500/10' : 'bg-kindra-800'}`}>
          <Flame 
            className={`w-5 h-5 sm:w-6 sm:h-6 transition-all duration-500 ${isFireActive ? 'text-teal-400 fill-teal-400 drop-shadow-[0_0_6px_rgba(45,212,191,0.4)]' : 'text-kindra-600'}`} 
            strokeWidth={2}
          />
        </div>
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl sm:text-3xl font-display font-bold tracking-tight transition-colors duration-500 ${isFireActive ? 'text-teal-400' : 'text-kindra-400'}`}>
              {displayStreak}
            </span>
            <span className={`text-xs sm:text-sm font-bold tracking-wide transition-colors duration-500 hidden xs:block ${isFireActive ? 'text-teal-500/80' : 'text-kindra-600'}`}>
              dias
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-kindra-500 leading-none mt-0.5">Ofensiva</span>
        </div>
      </div>

      {/* Direita: Dias da semana compactos */}
      <div className="flex items-center gap-1.5 sm:gap-2 z-10">
        {weekDays.map((day, idx) => {
          let circleStyle = "bg-kindra-800"; // base p/ futuro ou não feito
          
          if (day.isCompleted) {
            // Meta batida - fundo teal sutil
            circleStyle = "bg-teal-500/10 border border-teal-500/20";
          } else if (day.isDateToday) {
            // Hoje (Pendente)
            circleStyle = "border border-dashed border-kindra-600";
          } else if (!day.isFutureDate && !day.isCompleted) { 
             // Passado não batido
             circleStyle = "bg-kindra-800";
          }

          return (
            <div key={idx} className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all duration-300 ${circleStyle}`}>
              <Flame 
                className={`w-3 h-3 sm:w-4 sm:h-4 transition-all ${day.isDateToday ? (isFireActive ? 'text-teal-400 fill-teal-400' : 'text-kindra-500') : day.isCompleted ? 'text-teal-400 fill-teal-400' : 'text-kindra-500'}`} 
                strokeWidth={2} 
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
