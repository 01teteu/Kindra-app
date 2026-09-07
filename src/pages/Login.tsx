import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-kindra-50">
      {/* Subtle Studio Lighting Effect */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-300/20 blur-[100px] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <Card>
          <div className="mb-10 text-center">
            <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase tracking-[0.15em] mb-3 text-kindra-950">
              Acessar
            </h1>
            <p className="text-kindra-500 text-sm font-medium">
              Bem-vindo de volta ao Kindra
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              type="email"
              placeholder="Seu e-mail"
              {...register('email')}
              error={errors.email?.message}
            />
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Sua senha"
                {...register('password')}
                error={errors.password?.message}
              />
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-bold text-kindra-500 hover:text-kindra-900 transition-colors">
                  Esqueceu sua senha?
                </Link>
              </div>
            </div>

            {serverError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-red-600 text-sm text-center font-medium bg-red-50 py-3 rounded-xl border border-red-100"
              >
                {serverError}
              </motion.div>
            )}

            <div className="pt-2">
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                ENTRAR
              </Button>
            </div>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-kindra-200"></div>
              <span className="flex-shrink-0 mx-4 text-kindra-400 text-xs font-bold uppercase tracking-widest">
                Ou
              </span>
              <div className="flex-grow border-t border-kindra-200"></div>
            </div>

            <GoogleAuthButton />

            <p className="text-center text-sm text-kindra-500 mt-8">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-kindra-950 font-bold hover:text-kindra-700 transition-colors">
                Criar agora
              </Link>
            </p>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
