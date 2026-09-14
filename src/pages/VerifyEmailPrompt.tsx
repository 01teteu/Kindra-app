import { Sheet } from '../components/ui/Sheet';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, X, Edit2, ArrowLeft, CheckCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { OtpInput } from '../components/ui/OtpInput';
import { apiFetch } from '../lib/api';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';

// Reusing same logic from backend schema
const emailSchema = z.string().email("E-mail inválido.");

export function VerifyEmailPrompt() {
  const location = useLocation();
  const navigate = useNavigate();
  const originalEmail = location.state?.email || '';

  // States
  const [currentEmail, setCurrentEmail] = useState<string>(originalEmail);
  const [otp, setOtp] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (!originalEmail) {
      navigate('/login');
    }
  }, [originalEmail, navigate]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async () => {
    if (otp.length < 6) {
      setFeedback({ type: 'error', text: 'Por favor, digite os 6 dígitos do código.' });
      return;
    }

    setIsVerifying(true);
    setFeedback(null);

    try {
      const res = await apiFetch('/auth/verify-email/confirm', { data: { token: otp } });

      // Se sucesso, muda o estado de sucesso para disparar a animação (não seta mensagem de feedback)
      setIsSuccess(true);

      sessionStorage.removeItem('pendingToken');

      setTimeout(() => {
        if (!res.user.hasProfile) {
          navigate('/onboarding');
        } else {
          navigate('/home');
        }
      }, 2000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Código inválido ou expirado.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOpenEditModal = () => {
    setNewEmailInput(currentEmail);
    setModalStep(1);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleModalContinue = () => {
    setModalError('');
    if (newEmailInput.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
      setModalError('Este já é o seu e-mail atual.');
      return;
    }

    const parsed = emailSchema.safeParse(newEmailInput);
    if (!parsed.success) {
      setModalError(parsed.error.issues[0].message);
      return;
    }

    setModalStep(2);
  };

  const executeNormalResend = async () => {
    if (cooldown > 0) return;
    setFeedback(null);
    setIsResending(true);
    try {
      const token = sessionStorage.getItem('pendingToken');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      await apiFetch('/auth/verify-email/send', { data: {}, headers });
      setFeedback({ type: 'success', text: 'Novo código enviado com sucesso.' });
      setCooldown(30);
    } catch (err: any) {
      handleResendErrors(err);
    } finally {
      setIsResending(false);
    }
  };

  const executeChangeEmailAndResend = async () => {
    setIsResending(true);
    setIsModalOpen(false); // close modal

    try {
      const token = sessionStorage.getItem('pendingToken');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      await apiFetch('/auth/verify-email/change', {
        data: { newEmail: newEmailInput },
        headers
      });

      setCurrentEmail(newEmailInput);
      setFeedback({ type: 'success', text: 'E-mail atualizado e código enviado com sucesso!' });

      // Update location state so page reload retains the new email
      navigate('.', { replace: true, state: { email: newEmailInput } });

      setCooldown(30);
    } catch (err: any) {
      handleResendErrors(err);
    } finally {
      setIsResending(false);
    }
  };

  const handleResendErrors = (err: any) => {
    if (err.data?.retryAfter) {
      setCooldown(err.data.retryAfter);
      setFeedback({ type: 'error', text: err.message });
    } else if (err.message.includes('Muitas tentativas')) {
      setFeedback({ type: 'error', text: err.message });
    } else if (err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) {
      setFeedback({ type: 'error', text: 'Aguarde alguns minutos antes de solicitar um novo código.' });
    } else {
      setFeedback({ type: 'error', text: err.message || 'Erro ao reenviar o código.' });
    }
  };

  return (
    <AuthLayout>
      <Card className="w-full max-w-md text-center overflow-hidden">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mx-auto w-16 h-16 bg-kindra-200 rounded-full flex items-center justify-center mb-6">
                <Mail className="w-8 h-8 text-kindra-950" />
              </div>

              <h1 className="text-xl sm:text-3xl font-display font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] mb-4 text-kindra-950">
                Verifique seu E-mail
              </h1>

              <p className="text-kindra-400 mb-6 text-sm">
                Enviamos um código de 6 dígitos. Digite-o abaixo para ativar sua conta.
              </p>

              <div className="mb-6 flex items-center justify-between bg-kindra-50 p-3 rounded-xl border border-kindra-100">
                <div className="flex flex-col overflow-hidden text-left">
                  <span className="text-xs font-bold text-kindra-950 uppercase tracking-widest mb-1">E-mail Cadastrado</span>
                  <span className="text-sm text-kindra-500 truncate">{currentEmail}</span>
                </div>
                <button
                  onClick={handleOpenEditModal}
                  disabled={isVerifying || isResending}
                  className="p-2 text-kindra-400 hover:text-kindra-950 hover:bg-kindra-200 rounded-lg transition-colors disabled:opacity-50"
                  title="Editar e-mail"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-8">
                <OtpInput value={otp} onChange={setOtp} />
              </div>

              {feedback && feedback.type === 'error' && (
                <div className="mb-6 p-3 text-sm rounded-xl font-medium bg-rose-500/10 text-rose-400">
                  {feedback.text}
                </div>
              )}

              <div className="space-y-4">
                <Button
                  className="w-full"
                  onClick={handleVerify}
                  isLoading={isVerifying}
                  disabled={isResending}
                >
                  VALIDAR CÓDIGO
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={executeNormalResend}
                  isLoading={isResending}
                  disabled={cooldown > 0 || isVerifying}
                >
                  {cooldown > 0 ? `AGUARDE ${cooldown}s...` : 'REENVIAR CÓDIGO'}
                </Button>
                <Link to="/login" className="inline-flex items-center text-sm font-semibold text-kindra-500 hover:text-kindra-950 transition-colors">
                  Ir para o Login <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
              className="py-12 flex flex-col items-center justify-center"
            >
              <div className="w-20 h-20 bg-teal-500/10 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-10 h-10 text-teal-300" />
              </div>
              <h2 className="text-2xl font-display font-bold uppercase tracking-[0.1em] text-kindra-950 mb-2">
                Verificado!
              </h2>
              <p className="text-kindra-500 text-sm">
                Redirecionando você...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* MODAL DE CONFIRMAÇÃO */}
      <AnimatePresence>
        {isModalOpen && (
          <Sheet open={isModalOpen} onClose={() => setIsModalOpen(false)} label="Alterar e-mail">
            <div className="sheet-panel">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  {modalStep === 2 && (
                    <button
                      onClick={() => setModalStep(1)}
                      aria-label="Voltar para edição"
                      className="mr-2 p-1 rounded-lg text-kindra-400 hover:text-kindra-950 hover:bg-kindra-100 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <h3 className="text-lg font-bold text-kindra-950 flex-1">
                    {modalStep === 1 ? 'Alterar E-mail' : 'Confirmar E-mail'}
                  </h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    aria-label="Fechar alteração de e-mail"
                    className="p-1 rounded-lg text-kindra-400 hover:text-kindra-950 hover:bg-kindra-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {modalStep === 1 ? (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <p className="text-kindra-500 text-sm mb-4">
                      Digite o novo endereço de e-mail. Ao confirmar, enviaremos um novo código de verificação para ele.
                    </p>
                    <div className="mb-6 text-left">
                      <Input title="Novo e-mail" type="email"
                        value={newEmailInput}
                        onChange={(e) => {
                          setNewEmailInput(e.target.value);
                          setModalError('');
                        }}
                        error={modalError}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setIsModalOpen(false)}
                      >
                        CANCELAR
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleModalContinue}
                      >
                        CONTINUAR
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <p className="text-kindra-500 text-sm mb-6">
                      Você tem certeza que o e-mail abaixo está correto? Um novo código será enviado para:
                      <br /><br />
                      <strong className="text-kindra-950 bg-kindra-50 p-2 rounded block text-center break-all border border-kindra-100">
                        {newEmailInput}
                      </strong>
                    </p>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setModalStep(1)}
                      >
                        VOLTAR
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={executeChangeEmailAndResend}
                        isLoading={isResending}
                      >
                        CONFIRMAR
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
