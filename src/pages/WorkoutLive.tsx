import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Plus, Timer, ChevronLeft } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// Tipagem do Estado
type SetType = 'normal' | 'warmup' | 'drop';
interface WorkoutSet {
  id: string;
  type: SetType;
  kg: string;
  reps: string;
  completed: boolean;
}
interface WorkoutExercise {
  id: string;
  name: string;
  sets: WorkoutSet[];
}

export function WorkoutLive() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routineId = searchParams.get('routineId');

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Estado inicial simulando que o usuário já adicionou um exercício (para validarmos a UI)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([
    {
      id: 'ex-1',
      name: 'Supino Reto com Barra',
      sets: [
        { id: 'set-1', type: 'normal', kg: '20', reps: '12', completed: false }
      ]
    }
  ]);

  // Cronômetro do Treino
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAddSet = (exerciseId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id === exerciseId) {
        const lastSet = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: `set-${Date.now()}`,
              type: 'normal',
              kg: lastSet ? lastSet.kg : '',
              reps: lastSet ? lastSet.reps : '',
              completed: false
            }
          ]
        };
      }
      return ex;
    }));
  };

  const handleUpdateSet = (exerciseId: string, setId: string, field: 'kg' | 'reps', value: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id === exerciseId) {
        return {
          ...ex,
          sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s)
        };
      }
      return ex;
    }));
  };

  const handleToggleSet = (exerciseId: string, setId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id === exerciseId) {
        return {
          ...ex,
          sets: ex.sets.map(s => s.id === setId ? { ...s, completed: !s.completed } : s)
        };
      }
      return ex;
    }));
  };

  const handleFinish = () => {
    console.log('Treino Finalizado!', { duration: elapsedSeconds, exercises });
    navigate('/home'); // Volta pra home provisoriamente
  };

  return (
    <div className="min-h-screen bg-kindra-50 flex flex-col font-sans text-kindra-950 pb-24">
      {/* Luzes de Estúdio (Light Mode Premium) */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-300/20 blur-[100px] pointer-events-none" />

      {/* Header Fixo */}
      <header className="bg-kindra-50/80 backdrop-blur-xl sticky top-0 z-20 border-b border-kindra-200/50 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/home')} 
              className="w-10 h-10 rounded-full flex items-center justify-center text-kindra-500 hover:text-kindra-900 hover:bg-kindra-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="font-display font-bold text-xl leading-tight tracking-tight">
                {routineId ? 'Treino de Rotina' : 'Treino Livre'}
              </h1>
              <div className="flex items-center gap-1.5 text-kindra-500 text-sm font-medium mt-0.5">
                <Timer className="w-3.5 h-3.5" />
                <span className="tabular-nums font-bold tracking-wider">{formatTime(elapsedSeconds)}</span>
              </div>
            </div>
          </div>
          <Button onClick={handleFinish} size="sm" className="rounded-full px-6 shadow-sm">
            Finalizar
          </Button>
        </div>
      </header>

      {/* Corpo do Treino */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-6 mt-4 relative z-10">
        
        {exercises.map((exercise) => (
          <Card key={exercise.id} className="p-6">
            <h2 className="font-display font-bold text-lg text-kindra-950 mb-5">{exercise.name}</h2>
            
            {/* Cabeçalho da Tabela */}
            <div className="flex text-[11px] font-bold text-kindra-400 uppercase tracking-widest mb-3 px-2">
              <div className="w-12 text-center">Série</div>
              <div className="flex-1 text-center">Kg</div>
              <div className="flex-1 text-center">Reps</div>
              <div className="w-14 text-center"><Check className="w-4 h-4 mx-auto" /></div>
            </div>

            {/* Linhas das Séries */}
            <div className="space-y-2">
              {exercise.sets.map((set, setIndex) => (
                <div 
                  key={set.id} 
                  className={`flex items-center gap-3 p-2 rounded-2xl transition-all duration-300 ${
                    set.completed ? 'bg-green-50/60 ring-1 ring-green-100' : ''
                  }`}
                >
                  <div className="w-12 flex justify-center">
                    <span className={`text-sm font-bold ${set.completed ? 'text-green-600' : 'text-kindra-400'}`}>
                      {setIndex + 1}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <input 
                      type="number" 
                      value={set.kg}
                      onChange={(e) => handleUpdateSet(exercise.id, set.id, 'kg', e.target.value)}
                      disabled={set.completed}
                      className="w-full text-center bg-white border border-kindra-200 shadow-sm rounded-xl py-2 text-sm font-bold text-kindra-950 placeholder-kindra-300 focus:outline-none focus:ring-2 focus:ring-kindra-300 disabled:bg-transparent disabled:border-transparent disabled:shadow-none transition-all"
                      placeholder="--"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <input 
                      type="number" 
                      value={set.reps}
                      onChange={(e) => handleUpdateSet(exercise.id, set.id, 'reps', e.target.value)}
                      disabled={set.completed}
                      className="w-full text-center bg-white border border-kindra-200 shadow-sm rounded-xl py-2 text-sm font-bold text-kindra-950 placeholder-kindra-300 focus:outline-none focus:ring-2 focus:ring-kindra-300 disabled:bg-transparent disabled:border-transparent disabled:shadow-none transition-all"
                      placeholder="--"
                    />
                  </div>

                  <div className="w-14 flex justify-center">
                    <button
                      onClick={() => handleToggleSet(exercise.id, set.id)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        set.completed 
                          ? 'bg-green-500 text-white shadow-md shadow-green-500/20 scale-105' 
                          : 'bg-kindra-200 text-kindra-500 hover:bg-kindra-300'
                      }`}
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Botão Adicionar Série */}
            <button 
              onClick={() => handleAddSet(exercise.id)}
              className="w-full mt-5 py-2 flex items-center justify-center gap-1.5 text-sm font-bold text-kindra-500 hover:text-kindra-900 transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar Série
            </button>
          </Card>
        ))}

        {/* Botão Global Adicionar Exercício */}
        <Button 
          onClick={() => navigate('/workout/exercises')}
          variant="outline" 
          className="w-full rounded-[2rem] py-6 border-dashed border-2 border-kindra-200/50 bg-white/50 backdrop-blur-md hover:bg-white text-kindra-600 shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" /> Adicionar Exercício
        </Button>
      </main>
    </div>
  );
}
