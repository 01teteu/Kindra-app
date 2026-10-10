import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MoreVertical, RefreshCw } from 'lucide-react';
import { Onboarding } from './Onboarding';
import { apiFetch } from '../lib/api';
import * as nutritionApi from '../lib/nutrition';

export function Settings() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await nutritionApi.recalculateGoal();
    } catch (error) {
      console.error('Failed to recalculate:', error);
      alert('Não foi possível recalcular. Verifique se seu perfil (incluindo o Sexo Biológico) está completo.');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { data: {} }); navigate('/login'); }
    catch (error) { console.error(error); }
  };

  return (
    <div className="page-container">
      <div className="page-heading">
        <div><h1 className="text-kindra-950">Configurações</h1><p className="mt-2 text-sm text-kindra-500">Ajustes para o seu momento.</p></div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="icon-button"
            title="Opções"
            aria-label="Opções de nutrição"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-kindra-100 rounded-xl shadow-sm shadow-black/20 border border-kindra-200/50 z-50 overflow-hidden py-1">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleRecalculate();
                }}
                disabled={isRecalculating}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-kindra-700 hover:bg-kindra-200/50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 shrink-0 ${isRecalculating ? 'animate-spin' : ''}`} />
                Recalcular Metas
              </button>
            </div>
          )}
        </div>
      </div>
      <section className="mt-20 flex flex-col gap-5 border-t border-kindra-200 pt-6 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="settings-session-title">
        <div>
          <h2 id="settings-session-title" className="font-display text-xl font-bold text-kindra-950">Sessão</h2>
          <p className="mt-1 text-sm text-kindra-500">Encerre seu acesso quando terminar.</p>
        </div>
        <button type="button" onClick={handleLogout} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-kindra-300 px-4 py-2 text-sm font-semibold text-kindra-800 transition-colors hover:border-rose-400 hover:text-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:self-auto">
          <LogOut size={18} aria-hidden="true" /> Sair da conta
        </button>
      </section>
    </div>
  );
}

export function NutritionSettings() {
  return (
    <div className="page-container">
      <div className="page-heading"><div><h1 className="text-kindra-950">Editar metas nutricionais</h1><p className="mt-2 text-sm text-kindra-500">Suas respostas atuais, prontas para revisar.</p></div></div>
      <Onboarding mode="edit" />
    </div>
  );
}
