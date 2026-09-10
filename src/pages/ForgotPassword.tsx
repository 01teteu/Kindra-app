import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { OtpInput } from '../components/ui/OtpInput';
import { ArrowLeft, KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

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
  
  // Step 1 Form
  const { register: reg1, handleSubmit: hand1, formState: { errors: err1, isSubmitting: sub1 } } = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  
  // Step 2 Form
  const { handleSubmit: hand2, formState: { errors: err2, isSubmitting: sub2 }, setValue: setVal2, watch: watch2 } = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const tokenValue = watch2('token') || '';
  
  // Step 3 Form
  const { register: reg3, handleSubmit: hand3, formState: { errors: err3, isSubmitting: sub3 } } = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const onStep1 = async (data: Step1Data) => {
    try {
      setServerError('');
      await apiFetch('/auth/forgot-password', { data: { email: data.email } });
      setEmail(data.email);
      setStep(2);
    } catch (err: any) {
      if (err.message === 'GOOGLE_USER_NO_PASSWORD') {
        setServerError('Esta conta utiliza o login do Google. Por favor, volte e clique em "Continuar com o Google".');
      } else if (err.status) {
        setServerError(err.message);
      } else {
        setServerError('Erro de rede: falha na conexão.');
      }
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-kindra-50">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-kindra-200/40 blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        <Link to="/login" className="inline-flex items-center text-sm font-bold text-kindra-500 hover:text-kindra-900 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para login
        </Link>
        
        <Card className="relative overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: Solicitar Código */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="mb-8 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-kindra-100 text-kindra-900 flex items-center justify-center mb-4">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h1 className="text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950 mb-2">
                    Recuperar Senha
                  </h1>
                  <p className="text-kindra-500 text-sm font-medium">
                    Informe seu e-mail para receber um código de 6 dígitos.
                  </p>
                </div>
                
                <form onSubmit={hand1(onStep1)} className="space-y-5">
                  <Input
                    type="email"
                    placeholder="Seu e-mail cadastrado"
                    {...reg1('email')}
                    error={err1.email?.message}
                  />
                  {serverError && (
                    <div className="text-red-600 text-sm text-center font-medium bg-red-50 py-3 rounded-xl border border-red-100">
                      {serverError}
                    </div>
                  )}
                  <Button type="submit" className="w-full" isLoading={sub1}>
                    ENVIAR CÓDIGO
                  </Button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: Validar Código */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="mb-8 text-center">
                  <h1 className="text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950 mb-2">
                    Verificação
                  </h1>
                  <p className="text-kindra-500 text-sm font-medium">
                    Insira o código de segurança que enviamos para <br/><strong className="text-kindra-900">{email}</strong>
                  </p>
                </div>
                
                <form onSubmit={hand2(onStep2)} className="space-y-5">
                  <div className="mb-6">
                    <OtpInput 
                      value={tokenValue} 
                      onChange={(val) => setVal2('token', val, { shouldValidate: true })} 
                    />
                    {err2.token?.message && (
                      <p className="text-red-500 text-sm mt-3 text-center font-medium">{err2.token.message}</p>
                    )}
                  </div>
                  
                  {serverError && (
                    <div className="text-red-600 text-sm text-center font-medium bg-red-50 py-3 rounded-xl border border-red-100">
                      {serverError}
                    </div>
                  )}
                  <Button type="submit" className="w-full" isLoading={sub2}>
                    VALIDAR CÓDIGO
                  </Button>
                </form>
              </motion.div>
            )}

            {/* STEP 3: Nova Senha */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full"
              >
                <div className="mb-8 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-kindra-100 text-kindra-900 flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h1 className="text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950 mb-2">
                    Nova Senha
                  </h1>
                  <p className="text-kindra-500 text-sm font-medium">
                    Crie uma senha forte e segura.
                  </p>
                </div>
                
                <form onSubmit={hand3(onStep3)} className="space-y-5">
                  <Input
                    type="password"
                    placeholder="Nova senha"
                    {...reg3('password')}
                    error={err3.password?.message}
                  />
                  <Input
                    type="password"
                    placeholder="Confirmar nova senha"
                    {...reg3('confirmPassword')}
                    error={err3.confirmPassword?.message}
                  />
                  {serverError && (
                    <div className="text-red-600 text-sm text-center font-medium bg-red-50 py-3 rounded-xl border border-red-100">
                      {serverError}
                    </div>
                  )}
                  <Button type="submit" className="w-full" isLoading={sub3}>
                    REDEFINIR SENHA
                  </Button>
                </form>
              </motion.div>
            )}

            {/* STEP 4: Sucesso */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full text-center py-6"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950 mb-4">
                  Senha Alterada!
                </h1>
                <p className="text-kindra-500 text-sm font-medium mb-8">
                  Sua senha foi redefinida com sucesso. Você já pode acessar sua conta.
                </p>
                <Button onClick={() => navigate('/login')} className="w-full">
                  IR PARA O LOGIN
                </Button>
              </motion.div>
            )}

          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
