import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut, AlertCircle, Droplets, Trophy, Flame } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const userData = await apiFetch('/auth/me');
      if (!userData.hasProfile) {
        navigate('/onboarding');
        return;
      }
      setUser(userData);
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

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { data: {} });
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-kindra-500 font-medium animate-pulse flex items-center gap-2">
          <Droplets className="w-5 h-5 animate-spin" /> Carregando dashboard...
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

  const profile = user?.profile;
  const imc = profile && profile.heightCm > 0 
    ? (profile.weightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1) 
    : '--';

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
        {/* Header Section */}
        <div className="flex items-start justify-between mb-10 px-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-kindra-100 text-kindra-900 rounded-full flex items-center justify-center font-bold text-2xl shadow-sm border border-kindra-200/50 backdrop-blur-xl">
              {profile?.firstName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-kindra-950 tracking-tight">
                Olá, {profile?.firstName}
              </h1>
              <p className="text-sm font-medium text-kindra-500 mt-1">
                IMC {imc} • {profile?.goal}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="w-10 h-10 rounded-full bg-kindra-100 flex items-center justify-center text-kindra-500 hover:text-kindra-950 shadow-sm border border-kindra-200/50 backdrop-blur-xl transition-colors mt-2" 
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-2 px-2">
            <h2 className="text-xs font-bold text-kindra-500 uppercase tracking-widest">
              Visão Geral de Hoje
            </h2>
            <div className="h-px bg-kindra-200/50 flex-1"></div>
          </div>

          {/* Cards de Dashboard (Mockados por enquanto) */}
          <div className="grid grid-cols-2 gap-4">
            {/* Card Água */}
            <Card className="p-5 flex flex-col justify-between aspect-square rounded-[2rem] bg-gradient-to-br from-white to-blue-50/50 border-blue-100/50 shadow-xl shadow-blue-900/5">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-kindra-950 text-3xl tracking-tight">1.2<span className="text-lg text-kindra-500 font-medium">/3L</span></h3>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mt-1">Água</p>
              </div>
            </Card>

            {/* Card Streaks/Fogo */}
            <Card className="p-5 flex flex-col justify-between aspect-square rounded-[2rem] bg-gradient-to-br from-white to-orange-50/50 border-orange-100/50 shadow-xl shadow-orange-900/5">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mb-4 shadow-sm">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-kindra-950 text-3xl tracking-tight">4 <span className="text-lg text-kindra-500 font-medium">dias</span></h3>
                <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mt-1">Ofensiva</p>
              </div>
            </Card>
          </div>

          {/* Card Recorde Pessoal */}
          <Card className="p-6 rounded-[2rem] bg-kindra-100/80 backdrop-blur-xl border border-kindra-200/50 shadow-xl shadow-black/5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center shadow-sm shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-kindra-500 uppercase tracking-widest mb-1">Último PR</p>
              <h3 className="font-display font-bold text-kindra-950 text-xl tracking-tight leading-tight">Agachamento Livre</h3>
              <p className="text-sm font-medium text-kindra-600 mt-1">100kg por 8 repetições</p>
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
