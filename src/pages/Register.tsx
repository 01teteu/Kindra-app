import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { registerSchema, type RegisterInput } from '../lib/validations';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { TermsModal } from '../components/ui/TermsModal';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import { useToast } from '../components/ui/ToastProvider';

import './register.css';

const guardianMain = new URL('../assets/brand/totem/guardian-main.webp', import.meta.url).href;

const REGISTER_ERROR_TOAST_ID = 'register-error';

export function Register() {
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    // Se o usuário já estiver logado, redireciona
    apiFetch('/auth/me')
      .then(res => {
        if (res) navigate(res.hasProfile ? '/home' : '/onboarding');
      })
      .catch(() => {});
  }, [navigate]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  });

  const onSubmit = async (data: RegisterInput) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    try {
      dismissToast(REGISTER_ERROR_TOAST_ID);
      await apiFetch('/users/register', { data: { email: data.email } });
      sessionStorage.removeItem('pendingToken');
      sessionStorage.removeItem('pendingEmail');

      // Go to verify email prompt view
      navigate('/verify-email', { state: { email: data.email } });
    } catch (err: any) {
      if (err.status === 429) {
        showToast({
          id: REGISTER_ERROR_TOAST_ID,
          type: 'error',
          title: 'Aguarde um pouco',
          message: 'Espere alguns minutos antes de tentar novamente.',
        });
      } else {
        showToast({
          id: REGISTER_ERROR_TOAST_ID,
          type: 'error',
          title: 'Não foi possível enviar agora',
          message: 'Tente novamente em instantes.',
        });
      }
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const reduceMotion = useReducedMotion();

  return (
    <div className="register-page">
      <AuthLayout>
        <div className="register-content">
          <motion.figure
            className="register-guardian"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={guardianMain}
              width="525"
              height="718"
              alt="Guardian Totem do Kindra recebendo você"
            />
          </motion.figure>

          <motion.div
            className="register-intro"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1>Antes de continuar, vamos confirmar seu e-mail<span>.</span></h1>
            <p>É rapidinho. Enviaremos um link para validar seu acesso e manter sua conta segura.</p>
          </motion.div>

          <motion.div
            className="register-form-area"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <form onSubmit={handleSubmit(onSubmit)} className="register-form">
              <Input
                title="Seu e-mail"
                type="email"
                placeholder="voce@exemplo.com"
                {...register('email')}
                error={errors.email?.message}
              />

              <p className="register-password-hint">Depois de confirmar seu e-mail, você poderá definir sua senha.</p>

              <div className="register-terms">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                    <input
                      type="checkbox"
                      {...register('acceptTerms')}
                      className="peer appearance-none w-5 h-5 border-2 border-kindra-300 rounded-md checked:bg-kindra-950 checked:border-kindra-950 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-kindra-400 focus:ring-offset-2 focus:ring-offset-kindra-100"
                    />
                    <Check className="absolute w-3.5 h-3.5 text-kindra-50 opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity duration-200" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-kindra-500 group-hover:text-kindra-800 transition-colors font-medium">
                    Eu li e concordo com os{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsTermsModalOpen(true);
                      }}
                      className="text-kindra-950 font-bold hover:text-kindra-700 transition-colors"
                    >
                      Termos de Uso
                    </button>
                  </span>
                </label>
                {errors.acceptTerms && (
                  <span className="text-sm text-rose-400 ml-8 font-medium">{errors.acceptTerms.message}</span>
                )}
              </div>

              <Button type="submit" className="register-submit" isLoading={isSubmitting || isSending}>
                Cadastrar
              </Button>

              <div className="register-alternative"><span>ou continue com</span></div>
              <GoogleAuthButton />
            </form>

            <p className="register-login">
              Já tem uma conta?{' '}
              <Link to="/login">Fazer login</Link>
            </p>
          </motion.div>
        </div>

        <TermsModal
          isOpen={isTermsModalOpen}
          onClose={() => setIsTermsModalOpen(false)}
          onAccept={() => {
            setValue('acceptTerms', true, { shouldValidate: true });
            setIsTermsModalOpen(false);
          }}
        />
      </AuthLayout>
    </div>
  );
}
