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
  const guardian = new URL('../../assets/home/guardians/guardian-hydration.png', import.meta.url).href;

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
    <>
    <Card className="nutrition-water-card">
      <img className="nutrition-water-guardian" src={guardian} width="1254" height="1254" loading="lazy" decoding="async" alt="" aria-hidden="true" />
      <div className="nutrition-water-inner">
        <div className="nutrition-water-intro">
          <span className="eyebrow">Hidratação · hoje</span>
          <h2>Sua hidratação<br />de hoje.</h2>
          <p>Cada gole te aproxima da sua meta.</p>
        </div>

        <div className="nutrition-water-metrics" aria-label={`Consumo de hoje: ${currentMl} de ${targetMl} ml`}>
          <strong>{currentMl.toLocaleString('pt-BR')} <span>ml</span></strong>
          <div className="nutrition-water-goal"><span>de {targetMl.toLocaleString('pt-BR')} ml</span><strong>{percentage}%</strong></div>
        </div>

        <div role="progressbar" aria-label="Meta diária de hidratação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${currentMl} de ${targetMl} ml`} className="nutrition-water-progress">
          <div
            className="nutrition-water-progress-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="nutrition-water-actions">
          <button
            onClick={() => onAddWater(250)}
            disabled={busy}
            className="nutrition-water-quick"
          >
            <Plus className="h-5 w-5 shrink-0" aria-hidden="true" /> 250ml
          </button>
          <button
            onClick={() => onAddWater(500)}
            disabled={busy}
            className="nutrition-water-quick"
          >
            <Droplet className="h-5 w-5 shrink-0" aria-hidden="true" /> 500ml
          </button>
        </div>

        <form onSubmit={handleCustomSubmit} className="nutrition-water-custom">
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
                className="nutrition-water-input"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-kindra-400 text-xs font-bold uppercase tracking-wider pointer-events-none">
                ml
              </span>
            </div>
            <button
              type="submit"
              aria-label="Registrar água"
              disabled={busy || !customValue}
              className="nutrition-water-custom-submit"
            >
              <Check className="h-5 w-5" />
            </button>
          </div>
          {errorMsg && (
            <span className="text-xs font-medium text-rose-400 pl-1">{errorMsg}</span>
          )}
        </form>

        <div className="nutrition-water-feedback">
          <p role="status" className="text-sm text-teal-300 leading-relaxed">
            {isAdding ? 'Registrando consumo…' : removingId ? 'Removendo registro…' : notice}
          </p>
          {error && <p role="alert" className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-sm text-rose-400 leading-relaxed">{error}</p>}
        </div>

      </div>
    </Card>

        <section aria-labelledby="water-records-heading" className="nutrition-water-records">
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
            <div className="nutrition-water-empty">
              <p className="text-sm font-medium text-kindra-800">Seu primeiro copo começa aqui.</p>
              <p className="text-xs text-kindra-500 leading-relaxed mt-2">Use os atalhos acima ou registre uma quantidade personalizada.</p>
            </div>
          ) : (
            <ul className="nutrition-water-log-list">
              {logs.map(log => {
                const time = new Date(log.loggedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <li key={log.id} className={`nutrition-water-log ${confirmId === log.id ? 'is-confirming' : ''}`}>
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
    </>
  );
}
