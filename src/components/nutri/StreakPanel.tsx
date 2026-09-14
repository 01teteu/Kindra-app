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
      const historyItem = history.find((h) => isSameDay(parseISO(h.date), date));
      isCompleted = historyItem
        ? historyItem.waterGoalAchieved &&
          historyItem.kcalGoalAchieved &&
          historyItem.proteinGoalAchieved &&
          historyItem.carbsGoalAchieved &&
          historyItem.fatGoalAchieved
        : false;
    }

    return {
      label: WEEK_DAYS[i],
      date,
      isCompleted,
      isDateToday,
      isFutureDate: isFuture(date) && !isDateToday,
    };
  });

  return (
    <Card className="streak-card">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <Flame size={18} className={isFireActive ? 'text-teal-300' : 'text-kindra-500'} />
          <strong className="text-2xl font-semibold tabular-nums">{displayStreak}</strong>
          <span className="text-xs text-kindra-500">dias</span>
        </div>
        <p className="text-[10px] text-kindra-500 mt-1">Sua constância</p>
      </div>
      <div className="streak-week">
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className="streak-day"
            aria-label={`${day.date.toLocaleDateString('pt-BR')}: ${day.isCompleted ? 'meta atingida' : day.isFutureDate ? 'dia futuro' : 'meta não atingida'}`}
          >
            <span>{day.label}</span>
            <span
              className={`streak-dot${day.isCompleted ? ' complete' : ''}${day.isDateToday ? ' today' : ''}`}
              aria-current={day.isDateToday ? 'date' : undefined}
            >
              {day.isCompleted ? (
                <Check size={11} />
              ) : (
                <span className="text-[8px]">{day.date.getDate()}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
