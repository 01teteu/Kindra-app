import './verify-email.css';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';

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
    <div className="verify-email-page">
      <AuthLayout>
        <Card className="verify-email-content">
          <div className="verify-email-heading" role={status === 'error' ? 'alert' : 'status'}>
            {status === 'loading' && (
              <div className="verify-email-status-icon" aria-hidden="true">
                <div className="w-8 h-8 rounded-full border-4 border-kindra-500 border-t-kindra-950 animate-spin" />
              </div>
            )}

            {status === 'success' && (
              <div className="verify-email-status-icon text-teal-300" aria-hidden="true">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            )}

            {status === 'error' && (
              <div className="verify-email-status-icon text-rose-400" aria-hidden="true">
                <XCircle className="w-8 h-8" />
              </div>
            )}

            <h1>
              {status === 'loading' ? 'Confirmando seu e-mail' : status === 'success' ? 'E-mail confirmado' : 'Não foi possível confirmar seu e-mail'}
            </h1>

            <p className="text-kindra-400 mb-8">
              {message}
            </p>
          </div>

          {status === 'error' && (
            <Link to="/login" className="kindra-button button-primary button-md w-full">
              Ir para o login
            </Link>
          )}
        </Card>
      </AuthLayout>
    </div>
  );
}
