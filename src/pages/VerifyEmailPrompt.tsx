import './verify-email.css';
import { Sheet } from '../components/ui/Sheet';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { ArrowRight, X, ArrowLeft, CheckCircle } from 'lucide-react';
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
    <div className="verify-email-page">
      <AuthLayout>
        <Card className="verify-email-content">
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className="verify-email-heading">
                  <p className="verify-email-context">Falta confirmar seu e-mail</p>
                  <h1>Confira seu e-mail</h1>
                  <p>Enviamos um código de 6 dígitos para:</p>
                  <strong className="verify-email-address">{currentEmail}</strong>
                  <button
                    onClick={handleOpenEditModal}
                    disabled={isVerifying || isResending}
                    className="verify-email-edit"
                  >
                    Alterar e-mail
                  </button>
                  <p id="verify-email-code-help">Digite o código abaixo para confirmar seu e-mail e continuar no Kindra.</p>
                </div>

                <div className="mb-6" role="group" aria-label="Código de 6 dígitos" aria-describedby="verify-email-code-help">
                  <OtpInput value={otp} onChange={setOtp} />
                </div>

                {feedback && (
                  <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`verify-email-feedback verify-email-feedback-${feedback.type}`}>
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
                    Confirmar e-mail
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={executeNormalResend}
                    isLoading={isResending}
                    disabled={cooldown > 0 || isVerifying}
                  >
                    {cooldown > 0 ? `Reenviar em ${cooldown} s` : 'Reenviar código'}
                  </Button>
                  <Link to="/login" className="verify-email-login">
                    Ir para o login <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="verify-email-heading"
                role="status"
              >
                <div className="verify-email-status-icon text-teal-300">
                  <CheckCircle className="w-7 h-7" aria-hidden="true" />
                </div>
                <h1>E-mail confirmado</h1>
                <p className="text-kindra-500 text-sm">
                  Tudo certo. Você continuará no Kindra em instantes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* MODAL DE CONFIRMAÇÃO */}
        <AnimatePresence>
          {isModalOpen && (
            <Sheet open={isModalOpen} onClose={() => setIsModalOpen(false)} label="Alterar e-mail">
              <div className="sheet-panel verify-email-sheet">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    {modalStep === 2 && (
                      <button
                        onClick={() => setModalStep(1)}
                        aria-label="Voltar para edição"
                        className="verify-email-icon-button"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                    )}
                    <h3 className="text-lg font-bold text-kindra-950 flex-1">
                      {modalStep === 1 ? 'Alterar e-mail' : 'Confira o novo endereço'}
                    </h3>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      aria-label="Fechar alteração de e-mail"
                      className="verify-email-icon-button"
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
                        Informe o endereço em que você quer receber o código.
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
                      <div className="verify-email-sheet-actions">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setIsModalOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={handleModalContinue}
                        >
                          Continuar
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <p className="text-kindra-500 text-sm mb-6">
                        Enviaremos um novo código para este endereço:

                        <strong className="verify-email-address">
                          {newEmailInput}
                        </strong>
                      </p>

                      <div className="verify-email-sheet-actions">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setModalStep(1)}
                        >
                          Voltar
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={executeChangeEmailAndResend}
                          isLoading={isResending}
                        >
                          Confirmar
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
    </div>
  );
}
