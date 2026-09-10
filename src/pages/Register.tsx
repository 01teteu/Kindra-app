import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, X, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { apiFetch } from '../lib/api';
import { registerSchema, type RegisterInput } from '../lib/validations';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { TermsModal } from '../components/ui/TermsModal';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';

export function Register() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  });

  const passwordValue = watch('password', '');

  const rules = [
    { label: 'Mínimo de 8 caracteres', fulfilled: passwordValue.length >= 8 },
    { label: 'Letra maiúscula', fulfilled: /[A-Z]/.test(passwordValue) },
    { label: 'Letra minúscula', fulfilled: /[a-z]/.test(passwordValue) },
    { label: 'Número', fulfilled: /[0-9]/.test(passwordValue) },
    { label: 'Caractere especial', fulfilled: /[^A-Za-z0-9]/.test(passwordValue) },
  ];

  const onSubmit = async (data: RegisterInput) => {
    try {
      setServerError('');
      const { confirmPassword, acceptTerms, ...submitData } = data;
      const res = await apiFetch('/users/register', { data: submitData });
      
      if (res?.pendingToken) {
        sessionStorage.setItem('pendingToken', res.pendingToken);
      }

      // Go to verify email prompt view
      navigate('/verify-email', { state: { email: data.email } });
    } catch (err: any) {
      if (err.status) {
        setServerError(err.message);
      } else {
        setServerError('Erro de rede: não foi possível conectar ao servidor.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative bg-kindra-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10 my-8 flex flex-col items-center"
      >
        <div className="h-14 w-14 rounded-2xl bg-kindra-100 flex items-center justify-center border border-kindra-200 shadow-md mb-6">
           <Flame className="w-6 h-6 text-teal-400" strokeWidth={2.5} />
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl sm:text-[28px] font-display font-bold mb-2 text-kindra-950">
            Criar Conta
          </h1>
          <p className="text-kindra-500 text-[15px] font-medium">
            Junte-se ao Kindra
          </p>
        </div>

        <Card className="w-full rounded-[32px] p-8 border-kindra-200 bg-kindra-100 shadow-none">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              title="Email"
              type="email"
              placeholder="voce@exemplo.com"
              {...register('email')}
              error={errors.email?.message}
            />

            <div className="space-y-4">
              <Input
                title="Senha"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              
              <AnimatePresence>
                {passwordValue.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-kindra-50 border border-kindra-200 rounded-2xl p-4 space-y-2.5">
                      {rules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm">
                          <div className={cn(
                            "flex items-center justify-center w-5 h-5 rounded-full transition-colors duration-300",
                            rule.fulfilled ? "bg-kindra-950" : "bg-kindra-200"
                          )}>
                            {rule.fulfilled ? (
                              <Check className="w-3 h-3 text-kindra-50 stroke-[3]" />
                            ) : (
                              <X className="w-3 h-3 text-kindra-400 stroke-[3]" />
                            )}
                          </div>
                          <span
                            className={cn(
                              'transition-colors duration-300 font-medium',
                              rule.fulfilled ? 'text-kindra-950' : 'text-kindra-400'
                            )}
                          >
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Input
                title="Confirme a Senha"
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                error={errors.confirmPassword?.message}
              />
            </div>

            {/* Server Error Float (Toast) */}
            <AnimatePresence>
              {serverError && (
                <motion.div 
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center bg-kindra-100 border border-rose-500/30 shadow-2xl px-5 py-3.5 rounded-2xl w-[90%] max-w-sm"
                >
                  <p className="text-sm font-medium text-kindra-950 text-center">
                    {serverError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-1 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                  <input
                    type="checkbox"
                    {...register('acceptTerms')}
                    className="peer appearance-none w-5 h-5 border-2 border-kindra-300 rounded-md checked:bg-kindra-950 checked:border-kindra-950 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-kindra-400 focus:ring-offset-2 focus:ring-offset-white"
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
                <span className="text-sm text-red-500 ml-8 font-medium">{errors.acceptTerms.message}</span>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full h-12 text-[15px] rounded-xl font-bold bg-teal-500 text-white border-0 hover:bg-teal-600" isLoading={isSubmitting}>
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
    </div>
  );
}
