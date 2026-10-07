import { AuthLayout } from '../components/layout/AuthLayout';
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { loginSchema, type LoginInput } from '../lib/validations';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { GoogleAuthButton } from '../components/ui/GoogleAuthButton';
import { useToast } from '../components/ui/ToastProvider';

import './login.css';

const guardianMain = new URL('../assets/brand/totem/guardian-main.webp', import.meta.url).href;

const LOGIN_ERROR_TOAST_ID = 'login-error';

export function Login() {
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();
  const reduceMotion = useReducedMotion();

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
      dismissToast(LOGIN_ERROR_TOAST_ID);
      const response = await apiFetch('/auth/login', { data });

      // O JWT agora é gerenciado pelo navegador (HttpOnly Cookie)
      if (!response.user.hasProfile) {
        navigate('/onboarding');
      } else {
        navigate('/home');
      }
    } catch (err: any) {
      if (err.status) {
          showToast({
            id: LOGIN_ERROR_TOAST_ID,
            type: 'error',
            title: 'Não foi possível entrar',
            message: err.message,
          });
      } else {
          showToast({
            id: LOGIN_ERROR_TOAST_ID,
            type: 'error',
            title: 'Não foi possível entrar',
            message: 'Erro de rede: não foi possível conectar ao servidor.',
          });
      }
    }
  };

  return (
    <div className="login-page">
      <AuthLayout>
        <div className="login-content">
          <motion.figure
            className="login-guardian"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={guardianMain}
              width="525"
              height="718"
              alt="Guardian Totem do Kindra dando boas-vindas ao seu retorno"
            />
          </motion.figure>

          <motion.div
            className="login-intro"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1>Bom te ver de volta<span>.</span></h1>
            <p>Entre para continuar de onde parou.</p>
          </motion.div>

          <motion.div
            className="login-form-area"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            <form onSubmit={handleSubmit(onSubmit)} className="login-form">
              <Input
                title="Email"
                type="email"
                placeholder="voce@exemplo.com"
                {...register('email')}
                error={errors.email?.message}
              />

              <div className="login-password-field">
                <Input
                  title="Senha"
                  type="password"
                  placeholder="••••••••"
                  {...register('password')}
                  error={errors.password?.message}
                />
                <div className="login-forgot">
                  <Link to="/forgot-password">
                    Esqueceu a senha?
                  </Link>
                </div>
              </div>

              <div className="login-submit-wrap">
                <Button type="submit" className="login-submit" isLoading={isSubmitting}>
                  Entrar
                </Button>
              </div>

              <div className="login-alternative">
                <span>ou continue com</span>
              </div>

              <GoogleAuthButton />
            </form>
          </motion.div>

          <p className="login-register">
            Não tem conta?{' '}
            <Link to="/register">
              Criar conta
            </Link>
          </p>
        </div>
      </AuthLayout>
    </div>
  );
}
