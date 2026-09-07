import React, { useState } from 'react';
import { Droplet, Plus, Check } from 'lucide-react';
import { z } from 'zod';
import { Card } from '../ui/Card';

interface WaterTrackerProps {
  currentMl: number;
  targetMl: number;
  onAddWater: (ml: number) => void;
  isAdding: boolean;
}

// Zod Schema para blindar a entrada no Frontend
const customWaterSchema = z.coerce
  .number({ invalid_type_error: "Apenas números são permitidos." } as any)
  .int("O valor deve ser inteiro.")
  .positive("O valor deve ser maior que zero.")
  .min(10, "Mínimo de 10ml por registro.")
  .max(2000, "Máximo de 2000ml por vez (Prevenção de erro).");

export function WaterTracker({ currentMl, targetMl, onAddWater, isAdding }: WaterTrackerProps) {
  const [customValue, setCustomValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const percentage = Math.min(100, Math.round((currentMl / (targetMl || 1)) * 100));

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Validação de segurança via Zod
    const result = customWaterSchema.safeParse(customValue);
    
    if (!result.success) {
      setErrorMsg(result.error.issues[0].message);
      return;
    }

    onAddWater(result.data);
    setCustomValue('');
  };

  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 shrink-0 bg-kindra-900 text-kindra-50 rounded-2xl flex items-center justify-center shadow-lg shadow-black/20 border border-kindra-800">
            <Droplet className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-kindra-950 tracking-tight leading-tight">
              Hidratação
            </h2>
            <p className="text-sm font-medium text-kindra-500">Acompanhe seu consumo</p>
          </div>
        </div>

        <div className="flex justify-between items-end mb-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-display font-bold text-kindra-950">{currentMl}</span>
            <span className="text-sm font-medium text-kindra-500">/ {targetMl} ml</span>
          </div>
          <span className="text-sm font-medium text-kindra-900 bg-kindra-100 px-2 py-1 rounded-md">
            {percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-4 bg-kindra-100/50 rounded-full overflow-hidden mb-6 border border-kindra-200/50">
          <div 
            className="h-full bg-kindra-900 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Quick Add Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => onAddWater(250)}
            disabled={isAdding}
            className="flex items-center justify-center gap-2 py-3 min-h-[44px] bg-kindra-800 text-kindra-50 font-medium rounded-xl hover:bg-kindra-700 active:scale-95 transition-all disabled:opacity-50 border border-kindra-700/50"
          >
            <Plus className="h-4 w-4 shrink-0" /> 250ml
          </button>
          <button
            onClick={() => onAddWater(500)}
            disabled={isAdding}
            className="flex items-center justify-center gap-2 py-3 min-h-[44px] bg-kindra-800 text-kindra-50 font-medium rounded-xl hover:bg-kindra-700 active:scale-95 transition-all disabled:opacity-50 border border-kindra-700/50"
          >
            <Droplet className="h-4 w-4 shrink-0" /> 500ml
          </button>
        </div>

        {/* Custom Input */}
        <form onSubmit={handleCustomSubmit} className="flex flex-col gap-2 pt-4 border-t border-kindra-100/50">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Outro valor (ml)"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                disabled={isAdding}
                className="w-full bg-kindra-50 border border-kindra-200 text-kindra-900 placeholder:text-kindra-400 text-sm font-medium rounded-xl py-3 px-4 outline-none focus:border-kindra-900 focus:ring-1 focus:ring-kindra-900 transition-all disabled:opacity-50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-kindra-400 text-xs font-bold uppercase tracking-wider pointer-events-none">
                ml
              </span>
            </div>
            <button
              type="submit"
              disabled={isAdding || !customValue}
              className="flex items-center justify-center p-3 shrink-0 bg-kindra-800 text-kindra-50 font-medium rounded-xl hover:bg-kindra-700 active:scale-95 transition-all disabled:opacity-50 border border-kindra-700/50"
            >
              <Check className="h-5 w-5" />
            </button>
          </div>
          {errorMsg && (
            <span className="text-xs font-medium text-red-500 pl-1">{errorMsg}</span>
          )}
        </form>
      </div>
    </Card>
  );
}
