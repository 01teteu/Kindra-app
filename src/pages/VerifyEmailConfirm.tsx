import { AuthLayout } from '../components/layout/AuthLayout';
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function VerifyEmailConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verificando seu e-mail...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de verificação ausente na URL.');
      return;
    }

    apiFetch('/auth/verify-email/confirm', { data: { token } })
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'E-mail verificado com sucesso! Redirecionando...');

        // Auto-login success, redirect to onboarding or home based on profile
        setTimeout(() => {
          if (!res.user.hasProfile) {
            navigate('/onboarding');
          } else {
            navigate('/home');
          }
        }, 1500); // Wait 1.5s so user sees the success message
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Erro ao verificar o e-mail. O token pode ser inválido ou expirado.');
      });
  }, [token, navigate]);

  return (
    <AuthLayout>
      <Card className="w-full max-w-md text-center">
        {status === 'loading' && (
          <div className="mx-auto w-16 h-16 bg-kindra-200 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <div className="w-8 h-8 rounded-full border-4 border-kindra-500 border-t-kindra-950 animate-spin" />
          </div>
        )}

        {status === 'success' && (
          <div className="mx-auto w-16 h-16 bg-teal-500/10 text-teal-300 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8" />
          </div>
        )}

        {status === 'error' && (
          <div className="mx-auto w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mb-6">
            <XCircle className="w-8 h-8" />
          </div>
        )}

        <h1 className="text-xl sm:text-3xl font-display font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] mb-4 text-kindra-950">
          {status === 'loading' ? 'Verificando...' : status === 'success' ? 'Sucesso!' : 'Falha na Verificação'}
        </h1>

        <p className="text-kindra-400 mb-8">
          {message}
        </p>

        {status === 'error' && (
          <Link to="/login">
            <Button className="w-full">
              IR PARA O LOGIN
            </Button>
          </Link>
        )}
      </Card>
    </AuthLayout>
  );
}
