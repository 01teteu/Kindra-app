import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut, AlertCircle, Droplets, ArrowUpRight, Utensils, Dumbbell } from 'lucide-react';

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
        <Card className="max-w-md w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
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
  const imc =
    profile && profile.heightCm > 0
      ? (profile.weightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1)
      : '--';

  const goalLabel = profile?.goal === 'Manutencao' ? 'Manutenção' : profile?.goal;

  return (
    <div className="page-container">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Seu espaço</span>
          <h1 className="mt-2">Olá, {profile?.firstName}.</h1>
          <p>Vamos cuidar do seu dia?</p>
        </div>
        <button onClick={handleLogout} className="icon-button" aria-label="Sair da conta">
          <LogOut size={18} />
        </button>
      </header>
      <Card className="home-feature">
        <span className="eyebrow text-teal-300">Um passo de cada vez</span>
        <span className="feature-index" aria-hidden="true">
          K / 01
        </span>
        <h2>
          Sua rotina.
          <br />
          <span className="silver-text">Seu melhor ritmo.</span>
        </h2>
        <p>Registre suas refeições e acompanhe o que faz parte da sua evolução.</p>
        <Link className="kindra-button button-primary" to="/nutri">
          Abrir meu diário <ArrowUpRight size={17} />
        </Link>
      </Card>
      <div className="section-heading">
        <h2>Faz parte do seu dia</h2>
        <span className="eyebrow">Sua rotina</span>
      </div>
      <div className="home-links">
        <Link to="/nutri" className="routine-link">
          <span className="link-icon">
            <Utensils size={20} />
          </span>
          <div className="flex-1">
            <h3>Nutrição</h3>
            <p>Refeições, água e suas metas.</p>
          </div>
          <ArrowUpRight size={17} className="text-kindra-500" />
        </Link>
        <Link to="/workout" className="routine-link">
          <span className="link-icon">
            <Dumbbell size={20} />
          </span>
          <div className="flex-1">
            <h3>Treinos</h3>
            <p>Encontre seu próximo movimento.</p>
          </div>
          <ArrowUpRight size={17} className="text-kindra-500" />
        </Link>
      </div>
      <dl className="profile-strip">
        <div>
          <dt>Seu objetivo</dt>
          <dd>{goalLabel || 'Não informado'}</dd>
        </div>
        <div>
          <dt>IMC registrado</dt>
          <dd>{imc}</dd>
        </div>
      </dl>
    </div>
  );
}
