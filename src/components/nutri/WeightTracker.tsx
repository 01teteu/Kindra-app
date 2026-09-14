import React, { useState } from 'react';
import { Scale, Check } from 'lucide-react';
import type { WeightLog } from '../../lib/nutrition';
import { Card } from '../ui/Card';

interface WeightTrackerProps {
  logs: WeightLog[];
  onAddWeight: (kg: number) => void;
  isAdding: boolean;
}

export function WeightTracker({ logs, onAddWeight, isAdding }: WeightTrackerProps) {
  const [inputValue, setInputValue] = useState('');

  const currentWeight = logs.length > 0 ? logs[0].weightKg : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val >= 20 && val <= 400) {
      onAddWeight(val);
      setInputValue('');
    }
  };

  return (
    <Card className="p-5 sm:p-6 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-10 w-10 shrink-0 bg-kindra-200 text-teal-300 rounded-xl flex items-center justify-center">
            <Scale className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-kindra-950 tracking-tight leading-tight">
              Peso Atual
            </h2>
            <p className="text-sm font-medium text-kindra-500">Acompanhamento</p>
          </div>
        </div>

        {currentWeight && (
          <div className="flex items-end gap-2 mb-6">
            <span className="metric-number">
              {currentWeight}
            </span>
            <span className="text-lg text-kindra-500 font-medium mb-1">kg</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              aria-label="Novo peso em quilogramas"
              inputMode="decimal"
              type="number"
              step="0.1"
              min="20"
              max="400"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Novo peso (ex: 75.5)"
              disabled={isAdding}
              className="w-full bg-kindra-50 border border-kindra-200 text-kindra-900 placeholder:text-kindra-400 text-base font-medium rounded-xl py-3 pl-4 pr-10 outline-none focus:border-kindra-900 focus:ring-1 focus:ring-kindra-900 transition-all disabled:opacity-50"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-kindra-400 text-xs font-bold uppercase tracking-wider pointer-events-none">
              kg
            </span>
          </div>

          <button
            type="submit"
            aria-label="Registrar peso"
            disabled={isAdding || !inputValue}
            className="flex items-center justify-center p-3 shrink-0 bg-teal-400 text-kindra-base font-medium rounded-xl hover:bg-teal-300 active:scale-95 transition-all disabled:opacity-50 border border-transparent"
          >
            <Check className="h-5 w-5" />
          </button>
        </form>

        {logs.length > 0 && (
          <p className="text-xs text-kindra-400 mt-4 font-medium text-center">
            Último registro em {new Date(logs[0].loggedAt).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>
    </Card>
  );
}
