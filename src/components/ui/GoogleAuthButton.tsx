import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

export function GoogleAuthButton() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  // Devido a políticas estritas de anti-tracking do Safari/Chrome em iframes
  // o fluxo de popup Customizado (useGoogleLogin) costuma lançar exceções incontroláveis (Object)
  // dentro do iframe do AI Studio.
  //
  // Para garantir que não haja erros de runtime na UI, usamos o componente nativo
  // do Google. Ele usa UX baseada em iframe (renderizando o próprio botão), o que não bloqueia.
  //
  // Para deixá-lo mais bonito e integrado, aplicamos as personalizações máximas
  // permitidas pelas propriedades nativas (theme, size, shape="pill").

  const handleSuccess = async (credentialResponse: any) => {
    try {
      setError('');

      const response = await apiFetch('/auth/google', {
        // O backend agora valida estritamente a assinatura e a "audience" do ID Token.
        data: { credential: credentialResponse.credential }
      });

      if (!response.user.hasProfile) {
        navigate('/onboarding');
      } else {
        navigate('/home');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar com Google no servidor.');
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {error && (
        <p className="text-rose-400 text-xs text-center mb-3 font-medium px-2">{error}</p>
      )}
      <div className="w-full flex justify-center custom-google-btn-wrapper">
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => {
            setError('O login com Google falhou ou foi bloqueado.');
          }}
          useOneTap={false}
          theme="filled_black"
          size="large"
          text="continue_with"
          shape="pill"
          width="100%"
        />
      </div>
    </div>
  );
}
