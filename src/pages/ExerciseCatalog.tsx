import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, X, Check, Dumbbell, ChevronLeft } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface Exercise {
  id: string;
  name: string;
  targetMuscle: string;
  equipment: string;
  isCustom: boolean;
}

const MUSCLE_GROUPS = [
  'Todos',
  'Peito',
  'Costas',
  'Pernas',
  'Ombros',
  'Bíceps',
  'Tríceps',
  'Panturrilha',
  'Abdômen'
];

export function ExerciseCatalog() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('Todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const data = await apiFetch('/workouts/exercises');
        setExercises(data);
      } catch (err) {
        console.error('Falha ao buscar catálogo', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCatalog();
  }, []);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const filteredExercises = exercises.filter(ex => {
    const matchesGroup = activeGroup === 'Todos' || ex.targetMuscle === activeGroup;
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const handleConfirm = () => {
    // Provisoriamente volta pra página anterior, no futuro passaremos os IDs
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex justify-center p-4 relative overflow-hidden bg-kindra-50 pb-24">
      {/* Subtle Studio Lighting Effect */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-300/20 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl relative z-10 flex flex-col h-full"
      >
        {/* Header Fixo */}
        <div className="sticky top-0 bg-kindra-50/80 backdrop-blur-xl z-20 pb-4 border-b border-kindra-200/50">
          <div className="flex items-center gap-3 pt-2">
            <button 
              onClick={() => navigate(-1)} 
              className="w-10 h-10 rounded-full flex items-center justify-center text-kindra-500 hover:text-kindra-950 hover:bg-kindra-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-display font-bold text-xl text-kindra-950">
              Adicionar Exercício
            </h1>
          </div>

          <div className="mt-4 px-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-kindra-400" />
            <Input 
              placeholder="Buscar exercício..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-kindra-400 hover:text-kindra-900"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtros em Chips */}
          <div className="flex overflow-x-auto gap-2 mt-4 px-1 pb-2 scrollbar-hide">
            {MUSCLE_GROUPS.map(group => (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border transition-all duration-300 ${
                  activeGroup === group 
                    ? 'bg-kindra-950 text-white border-kindra-950 shadow-md' 
                    : 'bg-white text-kindra-500 border-kindra-200 hover:border-kindra-300'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Exercícios */}
        <div className="flex-1 mt-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-kindra-400">
              <Dumbbell className="w-8 h-8 animate-spin mb-4" />
              <p className="font-medium">Carregando catálogo...</p>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="text-center py-20 text-kindra-500">
              <p className="font-medium">Nenhum exercício encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExercises.map(ex => {
                const isSelected = selectedIds.has(ex.id);
                return (
                  <div 
                    key={ex.id}
                    onClick={() => toggleSelection(ex.id)}
                    className={`group flex items-center justify-between p-4 rounded-[1.5rem] border transition-all duration-300 cursor-pointer ${
                      isSelected 
                        ? 'bg-kindra-100 border-kindra-950 shadow-md scale-[1.02]' 
                        : 'bg-white/50 border-kindra-200/50 backdrop-blur-md hover:bg-white hover:border-kindra-300'
                    }`}
                  >
                    <div>
                      <h3 className={`font-bold font-display ${isSelected ? 'text-kindra-950' : 'text-kindra-900'}`}>
                        {ex.name}
                      </h3>
                      <p className="text-xs font-medium text-kindra-500 mt-1">
                        {ex.targetMuscle} • {ex.equipment}
                      </p>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-kindra-950 bg-kindra-950 text-white' : 'border-kindra-300'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Action Button (FAB) */}
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 left-0 right-0 px-4 z-50 flex justify-center"
          >
            <div className="w-full max-w-2xl">
              <Button 
                onClick={handleConfirm}
                className="w-full rounded-full shadow-xl shadow-kindra-950/20 py-6"
              >
                Adicionar {selectedIds.size} exercício{selectedIds.size > 1 ? 's' : ''}
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
