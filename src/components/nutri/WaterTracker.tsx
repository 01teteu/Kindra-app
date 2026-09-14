import React, { useRef, useState } from 'react';
import { Droplet, Plus, Check, Trash2, RefreshCw } from 'lucide-react';
import { z } from 'zod';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { WaterIntakeLog } from '../../lib/nutrition';

interface WaterTrackerProps {
  currentMl: number;
  targetMl: number;
  onAddWater: (ml: number) => Promise<boolean>;
  isAdding: boolean;
  logs: WaterIntakeLog[];
  onRemoveWater: (id: string) => Promise<boolean>;
  removingId: string | null;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  error: string;
  notice: string;
}

// Zod Schema para blindar a entrada no Frontend
const customWaterSchema = z.coerce
  .number({ invalid_type_error: "Apenas números são permitidos." } as any)
  .int("O valor deve ser inteiro.")
  .positive("O valor deve ser maior que zero.")
  .min(10, "Mínimo de 10ml por registro.")
  .max(2000, "Máximo de 2000ml por vez (Prevenção de erro).");

export function WaterTracker({ currentMl, targetMl, onAddWater, isAdding, logs, onRemoveWater, removingId, onRefresh, isRefreshing, error, notice }: WaterTrackerProps) {
  const [customValue, setCustomValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const busy = isAdding || removingId !== null || isRefreshing;

  const confirmRemoval = async (id: string) => {
    if (await onRemoveWater(id)) {
      setConfirmId(null);
      listHeadingRef.current?.focus({ preventScroll: true });
    }
  };

  const percentage = Math.min(100, Math.round((currentMl / (targetMl || 1)) * 100));

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg('');

    // Validação de segurança via Zod
    const result = customWaterSchema.safeParse(customValue);

    if (!result.success) {
      setErrorMsg(result.error.issues[0].message);
      return;
    }

    if (await onAddWater(result.data)) setCustomValue('');
  };

  return (
    <Card className="p-5 sm:p-6 relative overflow-hidden self-start">
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-10 w-10 shrink-0 bg-kindra-200 text-teal-300 rounded-xl flex items-center justify-center">
            <Droplet className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-kindra-950 tracking-tight leading-tight">
              Hidratação
            </h2>
            <p className="text-sm font-medium text-kindra-500">Acompanhe seu consumo</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-between items-end mb-2" aria-label={`Consumo de hoje: ${currentMl} de ${targetMl} ml`}>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-display font-bold text-kindra-950">{currentMl}</span>
            <span className="text-sm font-medium text-kindra-500">/ {targetMl} ml</span>
          </div>
          <span className="text-sm font-medium text-kindra-900 bg-kindra-100 px-2 py-1 rounded-md">
            {percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div role="progressbar" aria-label="Meta diária de hidratação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${currentMl} de ${targetMl} ml`} className="h-2 bg-kindra-200 rounded-full overflow-hidden mb-6 border border-kindra-200/50">
          <div
            className="h-full bg-teal-400 transition-all duration-500 motion-reduce:transition-none ease-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Quick Add Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => onAddWater(250)}
            disabled={busy}
            className="flex items-center justify-center gap-2 py-3 min-h-[44px] bg-teal-400 text-kindra-base font-medium rounded-xl hover:bg-teal-300 active:scale-95 transition-all disabled:opacity-50 border border-transparent"
          >
            <Plus className="h-4 w-4 shrink-0" /> 250ml
          </button>
          <button
            onClick={() => onAddWater(500)}
            disabled={busy}
            className="flex items-center justify-center gap-2 py-3 min-h-[44px] bg-teal-400 text-kindra-base font-medium rounded-xl hover:bg-teal-300 active:scale-95 transition-all disabled:opacity-50 border border-transparent"
          >
            <Droplet className="h-4 w-4 shrink-0" /> 500ml
          </button>
        </div>

        {/* Custom Input */}
        <form onSubmit={handleCustomSubmit} className="flex flex-col gap-2 pt-4 border-t border-kindra-100/50">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 min-w-0">
              <input
                aria-label="Quantidade de água em mililitros"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Outro valor (ml)"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                disabled={busy}
                className="w-full bg-kindra-50 border border-kindra-200 text-kindra-900 placeholder:text-kindra-400 text-base font-medium rounded-xl py-3 pl-4 pr-10 outline-none focus:border-kindra-900 focus:ring-1 focus:ring-kindra-900 transition-all disabled:opacity-50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-kindra-400 text-xs font-bold uppercase tracking-wider pointer-events-none">
                ml
              </span>
            </div>
            <button
              type="submit"
            aria-label="Registrar água"
              disabled={busy || !customValue}
              className="flex items-center justify-center p-3 shrink-0 bg-teal-400 text-kindra-base font-medium rounded-xl hover:bg-teal-300 active:scale-95 transition-all disabled:opacity-50 border border-transparent"
            >
              <Check className="h-5 w-5" />
            </button>
          </div>
          {errorMsg && (
            <span className="text-xs font-medium text-rose-400 pl-1">{errorMsg}</span>
          )}
        </form>

        <div className="mt-5 space-y-2">
          <p role="status" className="text-sm text-teal-300 leading-relaxed">
            {isAdding ? 'Registrando consumo…' : removingId ? 'Removendo registro…' : notice}
          </p>
          {error && <p role="alert" className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-sm text-rose-400 leading-relaxed">{error}</p>}
        </div>

        <section aria-labelledby="water-records-heading" className="mt-6 pt-6 border-t border-kindra-200">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 ref={listHeadingRef} tabIndex={-1} id="water-records-heading" className="text-base font-semibold text-kindra-950">Registros de hoje</h3>
              <p className="text-xs text-kindra-500 leading-relaxed mt-1">Cada registro conta para o seu progresso.</p>
            </div>
            <Button variant="ghost" className="shrink-0 px-3" aria-label="Atualizar registros de água" disabled={busy} onClick={async () => { setConfirmId(null); await onRefresh(); }}>
              <RefreshCw aria-hidden="true" className={`w-4 h-4 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            </Button>
          </div>
          {logs.length === 0 ? (
            <div className="rounded-xl border border-kindra-200 bg-kindra-50 p-5">
              <p className="text-sm font-medium text-kindra-800">Seu primeiro copo começa aqui.</p>
              <p className="text-xs text-kindra-500 leading-relaxed mt-2">Use os atalhos acima ou registre uma quantidade personalizada.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {logs.map(log => {
                const time = new Date(log.loggedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <li key={log.id} className={`rounded-xl border p-4 transition-colors motion-reduce:transition-none ${confirmId === log.id ? 'border-rose-500/20 bg-rose-500/10' : 'border-kindra-200 bg-kindra-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Droplet aria-hidden="true" className="w-5 h-5 text-teal-300 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-kindra-950">{log.amountMl} <span className="font-normal text-kindra-500">ml</span></p>
                          <time dateTime={log.loggedAt} className="text-xs text-kindra-500">Às {time}</time>
                        </div>
                      </div>
                      <Button ref={element => { if (element) removeButtons.current.set(log.id, element); else removeButtons.current.delete(log.id); }}
                        variant="ghost" className="px-3 text-kindra-500 hover:text-rose-400"
                        aria-label={`Remover ${log.amountMl} ml das ${time}`} aria-expanded={confirmId === log.id}
                        aria-controls={confirmId === log.id ? `water-confirm-${log.id}` : undefined}
                        disabled={busy} onClick={() => setConfirmId(confirmId === log.id ? null : log.id)}>
                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                      </Button>
                    </div>
                    {confirmId === log.id && (
                      <div id={`water-confirm-${log.id}`} className="mt-4 pt-4 border-t border-rose-500/20" onKeyDown={event => {
                        if (event.key === 'Escape' && !busy) { setConfirmId(null); removeButtons.current.get(log.id)?.focus(); }
                      }}>
                        <p className="text-sm font-medium text-kindra-950">Remover este registro de {log.amountMl} ml?</p>
                        <p className="mt-2 text-xs text-kindra-500 leading-relaxed">Essa quantidade deixará de contar no consumo de hoje. Sua meta permanece igual.</p>
                        <div className="flex flex-wrap gap-2 mt-4">
                          <Button variant="outline" disabled={busy} onClick={() => { setConfirmId(null); removeButtons.current.get(log.id)?.focus(); }}>Manter registro</Button>
                          <Button variant="danger" className="text-kindra-base" disabled={busy} isLoading={removingId === log.id} onClick={() => void confirmRemoval(log.id)}>{removingId === log.id ? 'Removendo…' : 'Confirmar remoção'}</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-kindra-500 leading-relaxed">Você pode remover registros de hoje enquanto o dia não estiver consolidado.</p>
        </section>
      </div>
    </Card>
  );
}
