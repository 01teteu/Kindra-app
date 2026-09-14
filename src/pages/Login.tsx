import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { loginSchema, type LoginInput } from '../lib/validations';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';

export function Login() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    // Se o usuário já estiver logado, pula o login
    apiFetch('/auth/me')
      .then(res => {
        if (res) {
          navigate(res.hasProfile ? '/home' : '/onboarding');
        }
      })
      .catch(() => {
        // Ignora erro, pois apenas significa que ele não tá logado
      });
  }, [navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      setServerError('');
      const response = await apiFetch('/auth/login', { data });

      // O JWT agora é gerenciado pelo navegador (HttpOnly Cookie)
      if (!response.user.hasProfile) {
        navigate('/onboarding');
      } else {
        navigate('/home');
      }
    } catch (err: any) {
      if (err.data?.needsVerification && err.data?.pendingToken) {
        sessionStorage.setItem('pendingToken', err.data.pendingToken);
        navigate('/verify-email', { state: { email: data.email } });
      } else {
        if (err.status) {
          setServerError(err.message);
        } else {
          setServerError('Erro de rede: não foi possível conectar ao servidor.');
        }
      }
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
            Bem-vindo de volta
          </h1>
          <p className="text-kindra-500 text-[15px] font-medium">
            Entre para continuar no Kindra
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

            <div className="space-y-3">
              <Input
                title="Senha"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                error={errors.password?.message}
              />
              <div className="flex justify-end pt-1">
                <Link to="/forgot-password" className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors">
                  Esqueceu a senha?
                </Link>
              </div>
            </div>

            {/* Server Error Float (Toast) */}
            <AnimatePresence>
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  role="alert" className="border border-rose-500/25 bg-rose-500/10 p-4 rounded-xl text-sm"
                >
                  <p className="text-sm font-medium text-kindra-950 text-center">
                    {serverError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-2">
              <Button type="submit" className="w-full h-12 text-[15px] rounded-xl font-bold bg-teal-400 text-kindra-base border-0 hover:bg-teal-300" isLoading={isSubmitting}>
                Entrar
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
          Não tem conta?{' '}
          <Link to="/register" className="text-teal-400 font-bold hover:text-teal-300 transition-colors">
            Criar conta
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}
