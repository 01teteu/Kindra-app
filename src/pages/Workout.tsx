import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Plus, Play, Dumbbell, AlertCircle } from 'lucide-react';

export function Workout() {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const routinesData = await apiFetch('/workouts/routines');
      setRoutines(routinesData);
      setIsLoading(false);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        navigate('/login');
      } else {
        setFetchError(err.message || 'Falha ao conectar com o servidor.');
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-kindra-500 font-medium animate-pulse flex items-center gap-2">
          <Dumbbell className="w-5 h-5 animate-spin" /> Carregando treinos...
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-kindra-900">Erro de Conexão</h2>
          <p className="text-kindra-600 pb-4">{fetchError}</p>
          <Button onClick={loadData} className="w-full">
            Tentar Novamente
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4 relative overflow-hidden">
      {/* Subtle Studio Lighting Effect */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-300/20 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl relative z-10 pt-4"
      >
        <div className="flex items-start justify-between mb-10 px-2">
          <h1 className="text-2xl font-display font-bold text-kindra-950 tracking-tight">
            Treinos
          </h1>
        </div>

        <div className="space-y-8">
          {/* Quick Start Section */}
          <section>
            <div className="flex items-center gap-3 mb-4 px-2">
              <h2 className="text-xs font-bold text-kindra-500 uppercase tracking-widest">
                Ação Rápida
              </h2>
              <div className="h-px bg-kindra-200/50 flex-1"></div>
            </div>
            
            <button 
              onClick={() => navigate('/workout/live')}
              className="w-full group rounded-[2rem] bg-kindra-100 p-6 shadow-xl shadow-black/5 border border-kindra-200/50 backdrop-blur-xl text-left flex items-center justify-between hover:border-kindra-300 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-kindra-900 shadow-sm group-hover:scale-105 transition-transform duration-300">
                  <Play className="w-5 h-5 fill-current ml-1" />
                </div>
                <div>
                  <h3 className="font-bold font-display text-kindra-950 text-xl tracking-tight mb-1">Treino Livre</h3>
                  <p className="text-kindra-500 text-sm font-medium">Comece a registrar sem um plano fixo</p>
                </div>
              </div>
            </button>
          </section>

          {/* My Routines Section */}
          <section>
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-3 flex-1">
                <h2 className="text-xs font-bold text-kindra-500 uppercase tracking-widest">
                  Suas Rotinas
                </h2>
                <div className="h-px bg-kindra-200/50 flex-1 mr-4"></div>
              </div>
              <button 
                onClick={() => navigate('/routines/new')}
                className="text-sm font-bold text-kindra-950 flex items-center gap-1 hover:text-kindra-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Criar
              </button>
            </div>

            {routines.length === 0 ? (
              <Card className="flex flex-col items-center justify-center text-center py-10">
                <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-kindra-200/50 flex items-center justify-center mb-5">
                  <Dumbbell className="w-6 h-6 text-kindra-400" />
                </div>
                <h3 className="font-display font-bold text-kindra-950 text-xl mb-2 tracking-tight">Construa seu treino</h3>
                <p className="text-kindra-500 text-sm font-medium max-w-[260px] leading-relaxed mb-8">
                  Crie sua primeira rotina para registrar sua evolução de forma inteligente.
                </p>
                <Button onClick={() => navigate('/routines/new')} className="rounded-full px-8">
                  Criar Nova Rotina
                </Button>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {routines.map(routine => (
                  <div 
                    key={routine.id} 
                    className="rounded-[2rem] bg-kindra-100 p-6 shadow-xl shadow-black/5 border border-kindra-200/50 backdrop-blur-xl hover:border-kindra-300 hover:shadow-lg transition-all duration-300 flex flex-col justify-between min-h-[160px] cursor-pointer group"
                    onClick={() => navigate(`/workout/live?routineId=${routine.id}`)}
                  >
                    <div>
                      <h3 className="font-display font-bold text-kindra-950 text-lg leading-tight truncate mb-2">
                        {routine.name}
                      </h3>
                      <p className="text-sm font-medium text-kindra-500 line-clamp-2 leading-relaxed">
                        {routine.exercises.length > 0 
                          ? routine.exercises.map((e: any) => e.exercise.name).join(' • ') 
                          : 'Rotina vazia'}
                      </p>
                    </div>
                    <div className="mt-6 text-sm font-bold text-kindra-900 flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Play className="w-4 h-4 fill-current" /> Iniciar
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
}
