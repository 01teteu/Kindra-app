import { useEffect, useRef, useState } from 'react';
import { MoreVertical, RefreshCw } from 'lucide-react';
import { Onboarding } from './Onboarding';
import * as nutritionApi from '../lib/nutrition';

export function Settings() {
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
