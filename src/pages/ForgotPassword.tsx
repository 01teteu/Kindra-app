import { AuthLayout } from '../components/layout/AuthLayout';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { OtpInput } from '../components/ui/OtpInput';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import './forgot-password.css';

const guardianMain = new URL('../assets/brand/totem/guardian-main.webp', import.meta.url).href;
const guardianFocused = new URL('../assets/brand/totem/guardian-focused.webp', import.meta.url).href;
const guardianCelebrating = new URL('../assets/brand/totem/guardian-celebrating.webp', import.meta.url).href;

// Schemas locais para os passos
const step1Schema = z.object({ email: z.string().email("E-mail inválido.") });
const step2Schema = z.object({ token: z.string().length(6, "O código deve ter exatos 6 dígitos numéricos.").regex(/^\d+$/, "Apenas números.") });
const step3Schema = z.object({
  password: z
    .string()
    .min(8, "Mínimo de 8 caracteres.")
    .regex(/[A-Z]/, "Pelo menos uma letra maiúscula.")
    .regex(/[a-z]/, "Pelo menos uma letra minúscula.")
    .regex(/[0-9]/, "Pelo menos um número.")
    .regex(/[^A-Za-z0-9]/, "Pelo menos um caractere especial."),
  confirmPassword: z.string().min(1, "Confirme sua senha."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

export function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 4 = Sucesso
  const [email, setEmail] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [serverError, setServerError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const requestingRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  // Step 1 Form
  const { register: reg1, handleSubmit: hand1, formState: { errors: err1, isSubmitting: sub1 } } = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });

  // Step 2 Form
  const { handleSubmit: hand2, formState: { errors: err2, isSubmitting: sub2 }, setValue: setVal2, watch: watch2 } = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const tokenValue = watch2('token') || '';

  // Step 3 Form
  const { register: reg3, handleSubmit: hand3, formState: { errors: err3, isSubmitting: sub3 } } = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const onStep1 = async (data: Step1Data) => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setIsRequesting(true);
    try {
      setServerError('');
      await apiFetch('/auth/forgot-password', { data: { email: data.email } });
      setEmail(data.email);
      setResendCooldown(60);
      setStep(2);
    } catch (err: any) {
      if (err.status === 429) {
        setServerError('Aguarde alguns minutos antes de solicitar outro código.');
      } else {
        setServerError('Não foi possível solicitar agora. Tente novamente em instantes.');
      }
    } finally {
      requestingRef.current = false;
      setIsRequesting(false);
    }
  };

  const onResend = async () => {
    if (requestingRef.current || resendCooldown > 0 || !email) return;
    requestingRef.current = true;
    setIsResending(true);
    setServerError('');
    setResendNotice('');
    try {
      await apiFetch('/auth/forgot-password', { data: { email } });
      setResendNotice('Confira seu e-mail. Se este endereço puder ser recuperado, você receberá um novo código.');
      setResendCooldown(60);
    } catch (err: any) {
      setServerError(err.status === 429
        ? 'Aguarde alguns minutos antes de solicitar outro código.'
        : 'Não foi possível solicitar agora. Tente novamente em instantes.');
    } finally {
      requestingRef.current = false;
      setIsResending(false);
    }
  };

  const onStep2 = async (data: Step2Data) => {
    try {
      setServerError('');
      const response = await apiFetch('/auth/verify-reset-code', { data: { email, token: data.token } });
      setJwtToken(response.resetToken);
      setStep(3);
    } catch (err: any) {
      if (err.status) {
        setServerError(err.message);
      } else {
        setServerError('Erro de rede: falha na conexão.');
      }
    }
  };

  const onStep3 = async (data: Step3Data) => {
    try {
      setServerError('');
      await apiFetch('/auth/reset-password', {
        data: {
          password: data.password,
          confirmPassword: data.confirmPassword
        },
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });
      setStep(4);
    } catch (err: any) {
      if (err.status) {
        setServerError(err.message);
      } else {
        setServerError('Erro de rede: falha na conexão.');
      }
    }
  };

  return (
    <div className="forgot-password-page">
      <AuthLayout>
        <div className="forgot-password-flow">
          <Link to="/login" className="forgot-password-back">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar para o login
          </Link>

          <div className="forgot-password-progress" role="progressbar" aria-label="Recuperação de senha"
            aria-valuemin={0} aria-valuemax={3} aria-valuenow={step - 1}
            aria-valuetext={`${step - 1} de 3 etapas concluídas`}>
            <span className="forgot-password-progress-count">{step - 1} <span>DE 3</span></span>
            <span className="forgot-password-progress-label">RECUPERAÇÃO DE ACESSO</span>
            <span className="forgot-password-progress-track" aria-hidden="true">
              <span style={{ width: `${((step - 1) / 3) * 100}%` }} />
            </span>
          </div>

          <div className="forgot-password-stage" data-stage={step}>
            <div className="forgot-password-guardian" aria-hidden="true">
              <img
                src={step === 2 ? guardianFocused : step === 4 ? guardianCelebrating : guardianMain}
                alt=""
              />
            </div>
            <AnimatePresence mode="wait">

              {/* STEP 1: Solicitar Código */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  className="forgot-password-panel"
                >
                  <div className="forgot-password-heading">
                    <h1 className="font-display font-bold text-kindra-950">
                      Esqueceu sua senha?<br /><span>Vamos resolver.</span>
                    </h1>
                    <p className="text-kindra-500 text-sm font-medium">
                      Digite o e-mail usado no seu cadastro. Enviaremos um código para você continuar com segurança.
                    </p>
                  </div>

                  <form onSubmit={hand1(onStep1)} className="forgot-password-form">
                    <Input
                      title="E-mail cadastrado"
                      type="email"
                      placeholder="voce@exemplo.com"
                      {...reg1('email')}
                      error={err1.email?.message}
                    />
                    {serverError && (
                      <div role="alert" className="forgot-password-error">
                        {serverError}
                      </div>
                    )}
                    <Button type="submit" className="forgot-password-primary" isLoading={sub1 || isRequesting}>
                      Enviar código
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* STEP 2: Validar Código */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  className="forgot-password-panel"
                >
                  <div className="forgot-password-heading">
                    <h1 className="font-display font-bold text-kindra-950">
                      Confira seu e-mail
                    </h1>
                    <p className="text-kindra-500 text-sm font-medium">
                      Se este endereço puder ser recuperado, você receberá um código de 6 dígitos em
                      <strong className="forgot-password-email">{email}</strong>
                    </p>
                  </div>

                  <form onSubmit={hand2(onStep2)} className="forgot-password-form">
                    <div className="forgot-password-code" role="group" aria-label="Código de 6 dígitos" aria-describedby={err2.token ? 'reset-code-error' : undefined}>
                      <OtpInput
                        value={tokenValue}
                        onChange={(val) => setVal2('token', val, { shouldValidate: true })}
                      />
                      {err2.token?.message && (
                        <p id="reset-code-error" role="alert" className="text-rose-400 text-sm mt-3">{err2.token.message}</p>
                      )}
                    </div>

                    {serverError && (
                      <div role="alert" className="forgot-password-error">
                        {serverError}
                      </div>
                    )}
                    <Button type="submit" className="forgot-password-primary" isLoading={sub2}>
                      Validar código
                    </Button>
                    {resendNotice && <p role="status" className="forgot-password-notice">{resendNotice}</p>}
                    <Button type="button" variant="ghost" className="forgot-password-resend" onClick={onResend}
                      isLoading={isResending} disabled={resendCooldown > 0 || sub2}>
                      {resendCooldown > 0 ? `Pedir outro código em ${resendCooldown} s` : 'Pedir outro código'}
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* STEP 3: Nova Senha */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  className="forgot-password-panel"
                >
                  <div className="forgot-password-heading">
                    <h1 className="font-display font-bold text-kindra-950">
                      Agora escolha sua nova senha.
                    </h1>
                    <p className="text-kindra-500 text-sm font-medium">
                      Escolha uma nova senha para acessar sua conta.
                    </p>
                  </div>

                  <form onSubmit={hand3(onStep3)} className="forgot-password-form">
                    <Input
                      title="Nova senha"
                      type="password"
                      aria-describedby="reset-password-requirements"
                      placeholder="Digite sua nova senha"
                      {...reg3('password')}
                      error={err3.password?.message}
                    />
                    <p id="reset-password-requirements" className="forgot-password-requirements">
                      Use pelo menos 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.
                    </p>
                    <Input
                      title="Confirmar nova senha"
                      type="password"
                      placeholder="Repita sua nova senha"
                      {...reg3('confirmPassword')}
                      error={err3.confirmPassword?.message}
                    />
                    {serverError && (
                      <div role="alert" className="forgot-password-error">
                        {serverError}
                      </div>
                    )}
                    <Button type="submit" className="forgot-password-primary" isLoading={sub3}>
                      Redefinir senha
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* STEP 4: Sucesso */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="forgot-password-panel"
                >
                  <div role="status" className="forgot-password-heading">
                    <div className="forgot-password-success-icon">
                      <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
                    </div>
                    <h1 className="font-display font-bold text-kindra-950">
                      Pronto. Sua senha foi atualizada.
                    </h1>
                    <p className="text-kindra-500 text-sm font-medium">
                      Sua senha foi redefinida com sucesso. Você já pode acessar sua conta.
                    </p>
                  </div>
                  <Button onClick={() => navigate('/login')} className="forgot-password-primary">
                    Ir para o login
                  </Button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </AuthLayout>
    </div>
  );
}
