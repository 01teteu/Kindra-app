import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch('/auth/me')
      .then(res => {
        setUser(res);
        if (!res.hasProfile) {
          navigate('/onboarding');
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        navigate('/login');
      });
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
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-kindra-50">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-kindra-950">Home do App</h1>
        <p className="text-kindra-500 mb-8">Bem-vindo(a), {user?.email}!</p>
        <Button onClick={handleLogout} className="w-full" variant="outline">
          SAIR DA CONTA
        </Button>
      </Card>
    </div>
  );
}
