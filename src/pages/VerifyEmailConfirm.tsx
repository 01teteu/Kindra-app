import './verify-email.css';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';

export function VerifyEmailConfirm() {
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token');
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!token) {
      sessionStorage.removeItem('pendingToken');
      sessionStorage.removeItem('pendingEmail');
      setInvalid(true);
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.scope !== 'pending_verification' || typeof payload.challengeId !== 'string' || !payload.challengeId || typeof payload.id !== 'string') {
        throw new Error('INVALID_CONTEXT');
      }
      sessionStorage.setItem('pendingToken', token);
      const email = typeof payload.email === 'string' ? payload.email : '';
      sessionStorage.setItem('pendingEmail', email);
      navigate('/verify-email', { replace: true, state: { email } });
    } catch {
      sessionStorage.removeItem('pendingToken');
      sessionStorage.removeItem('pendingEmail');
      setInvalid(true);
    }
  }, [navigate]);

  return (
    <div className="verify-email-page">
      <AuthLayout>
        <Card className="verify-email-content">
          <div className="verify-email-heading" role={invalid ? 'alert' : 'status'}>
            <h1>{invalid ? 'Este link não pode ser usado' : 'Preparando a confirmação'}</h1>
            <p className="text-kindra-400 mb-8">{invalid ? 'Solicite um novo código para continuar com segurança.' : 'Aguarde um instante.'}</p>
          </div>

          {invalid && (
            <Link to="/verify-email" className="kindra-button button-primary button-md w-full">
              Solicitar novo código
            </Link>
          )}
        </Card>
      </AuthLayout>
    </div>
  );
}
