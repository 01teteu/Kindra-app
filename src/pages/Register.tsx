import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { registerSchema, type RegisterInput } from '../lib/validations';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { TermsModal } from '../components/ui/TermsModal';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import { useToast } from '../components/ui/ToastProvider';

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

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10 flex flex-col items-center"
      >


        <div className="auth-title">
          <h1 className="text-2xl sm:text-[28px] font-display font-bold mb-2 text-kindra-950">
            Criar Conta
          </h1>
          <p className="text-kindra-500 text-[15px] font-medium">
            Junte-se ao Kindra
          </p>
        </div>

        <Card className="w-full rounded-[20px] p-8 border-kindra-200 bg-kindra-100 shadow-none">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              title="Email"
              type="email"
              placeholder="voce@exemplo.com"
              {...register('email')}
              error={errors.email?.message}
            />

            <p className="text-sm text-kindra-500">Depois de confirmar seu e-mail, você poderá definir sua senha.</p>

            <div className="flex flex-col gap-1 pt-2">
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

            <div className="pt-2">
              <Button type="submit" className="w-full h-12 text-[15px] rounded-xl font-bold bg-teal-400 text-kindra-base border-0 hover:bg-teal-300" isLoading={isSubmitting || isSending}>
                Cadastrar
              </Button>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-kindra-200"></div>
              <span className="flex-shrink-0 mx-4 text-kindra-400 text-sm font-medium">
                ou continue com
              </span>
              <div className="flex-grow border-t border-kindra-200"></div>
            </div>

            <GoogleAuthButton />
          </form>
        </Card>

        <p className="text-center text-[15px] text-kindra-500 mt-8 font-medium">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-teal-400 font-bold hover:text-teal-300 transition-colors">
            Fazer login
          </Link>
        </p>
      </motion.div>

      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        onAccept={() => {
          setValue('acceptTerms', true, { shouldValidate: true });
          setIsTermsModalOpen(false);
        }}
      />
    </AuthLayout>
  );
}
