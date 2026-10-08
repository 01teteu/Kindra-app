import './verify-email.css';
import { Sheet } from '../components/ui/Sheet';
import { AuthLayout } from '../components/layout/AuthLayout';
import { useState, useEffect, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { ArrowRight, X, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { OtpInput } from '../components/ui/OtpInput';
import { apiFetch } from '../lib/api';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';

const guardianFocused = new URL('../assets/brand/totem/guardian-focused.webp', import.meta.url).href;

// Reusing same logic from backend schema
const emailSchema = z.string().email("E-mail inválido.");
const passwordSchema = z.string().min(8, 'Mínimo de 8 caracteres.').max(100, 'Senha muito longa.')
  .regex(/[A-Z]/, 'Pelo menos uma letra maiúscula.')
  .regex(/[a-z]/, 'Pelo menos uma letra minúscula.')
  .regex(/[0-9]/, 'Pelo menos um número.')
  .regex(/[^A-Za-z0-9]/, 'Pelo menos um caractere especial.');

function hasPendingContext() {
  const token = sessionStorage.getItem('pendingToken');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.scope === 'pending_verification' && typeof payload.challengeId === 'string' && payload.challengeId && payload.exp > Date.now() / 1000) return true;
  } catch { /* Link antigo ou inválido: o servidor é a autoridade final. */ }
  sessionStorage.removeItem('pendingToken');
  sessionStorage.removeItem('pendingEmail');
  return false;
}

export function VerifyEmailPrompt() {
  const location = useLocation();
  const navigate = useNavigate();
  const originalEmail = location.state?.email || sessionStorage.getItem('pendingEmail') || '';

  // States
  const [currentEmail, setCurrentEmail] = useState<string>(originalEmail);
  const [otp, setOtp] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasContext, setHasContext] = useState(hasPendingContext);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verifyInFlight = useRef(false);
  const resendInFlight = useRef(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [modalError, setModalError] = useState('');

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
    if (verifyInFlight.current || resendInFlight.current) return;
    if (!hasContext) {
      setFeedback({ type: 'error', text: 'Abra o link enviado ao seu e-mail antes de confirmar.' });
      return;
    }
    if (otp.length < 6) {
      setFeedback({ type: 'error', text: 'Por favor, digite os 6 dígitos do código.' });
      return;
    }
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      setFeedback({ type: 'error', text: passwordResult.error.issues[0].message });
      return;
    }
    if (password !== confirmPassword) {
      setFeedback({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    verifyInFlight.current = true;
    setIsVerifying(true);
    setFeedback(null);

    try {
      const pendingToken = sessionStorage.getItem('pendingToken');
      if (!pendingToken) {
        setHasContext(false);
        setFeedback({ type: 'error', text: 'Sua confirmação expirou. Solicite um novo código para continuar.' });
        return;
      }
      const res = await apiFetch('/auth/verify-email/confirm', {
        data: { token: otp, password, confirmPassword }, headers: { Authorization: `Bearer ${pendingToken}` },
      });

      // Se sucesso, muda o estado de sucesso para disparar a animação (não seta mensagem de feedback)
      setIsSuccess(true);

      sessionStorage.removeItem('pendingToken');
      sessionStorage.removeItem('pendingEmail');
      setHasContext(false);

      setTimeout(() => {
        if (!res.user.hasProfile) {
          navigate('/onboarding');
        } else {
          navigate('/home');
        }
      }, 2000);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        sessionStorage.removeItem('pendingToken');
        sessionStorage.removeItem('pendingEmail');
        setHasContext(false);
      }
      setFeedback({ type: 'error', text: err.status === 401 || err.status === 403
        ? 'Sua confirmação expirou. Solicite um novo código para continuar.'
        : err.message || 'Código inválido ou expirado.' });
    } finally {
      verifyInFlight.current = false;
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
    if (cooldown > 0 || resendInFlight.current || verifyInFlight.current || isResending || isVerifying) return;
    resendInFlight.current = true;
    setFeedback(null);
    setIsResending(true);
    try {
      const parsed = emailSchema.safeParse(currentEmail.trim().toLowerCase());
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await apiFetch('/auth/verify-email/send', { data: { email: parsed.data } });
      setFeedback({ type: 'success', text: 'Confira seu e-mail. Se este endereço puder ser verificado, você receberá novas instruções.' });
      setCooldown(30);
    } catch (err: any) {
      handleResendErrors(err);
    } finally {
      resendInFlight.current = false;
      setIsResending(false);
    }
  };

  const executeChangeEmailAndResend = async () => {
    if (resendInFlight.current || verifyInFlight.current || isResending || isVerifying) return;
    resendInFlight.current = true;
    setIsResending(true);
    setIsModalOpen(false); // close modal

    try {
      const token = sessionStorage.getItem('pendingToken');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      await apiFetch('/auth/verify-email/change', {
        data: { newEmail: newEmailInput },
        headers
      });

      sessionStorage.removeItem('pendingToken');
      sessionStorage.removeItem('pendingEmail');
      setHasContext(false);

      setCurrentEmail(newEmailInput);
      setFeedback({ type: 'success', text: 'Se a alteração puder prosseguir, confira o novo endereço de e-mail.' });

      // Update location state so page reload retains the new email
      navigate('.', { replace: true, state: { email: newEmailInput } });

      setCooldown(30);
    } catch (err: any) {
      handleResendErrors(err);
    } finally {
      resendInFlight.current = false;
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
      setFeedback({ type: 'error', text: 'Não foi possível solicitar agora. Tente novamente em instantes.' });
    }
  };

  return (
    <div className="verify-email-page verify-email-prompt-page">
      <AuthLayout>
        <div className="verify-email-content verify-email-flow">
          <div className="verify-email-guardian" aria-hidden="true">
            <img src={guardianFocused} alt="" />
          </div>
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="form"
                className="verify-email-main"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className="verify-email-heading">
                  <p className="verify-email-context">CONFIRMAÇÃO DE E-MAIL</p>
                  <h1>Agora só falta <span>confirmar.</span></h1>
                  <p>{hasContext
                    ? 'Digite o código do e-mail e crie sua senha para continuar o cadastro.'
                    : 'Confira seu e-mail. Se este endereço puder ser verificado, você receberá um link e um código para continuar.'}</p>
                  {hasContext ? <div className="verify-email-address-row">
                    <strong className="verify-email-address">{currentEmail}</strong>
                    <button onClick={handleOpenEditModal} disabled={isVerifying || isResending} className="verify-email-edit">Alterar e-mail</button>
                  </div> : (
                    <div className="verify-email-email-entry">
                      <Input title="E-mail" type="email" placeholder="voce@exemplo.com" value={currentEmail} onChange={event => setCurrentEmail(event.target.value)} />
                    </div>
                  )}
                </div>

                {hasContext && <>
                  <p id="verify-email-code-help" className="verify-email-code-label">Código de 6 dígitos</p>
                  <div className="verify-email-otp" role="group" aria-label="Código de 6 dígitos" aria-describedby="verify-email-code-help">
                    <OtpInput value={otp} onChange={setOtp} />
                  </div>
                  <div className="verify-email-password-fields">
                    <Input title="Nova senha" type="password" value={password} onChange={event => setPassword(event.target.value)} />
                    <Input title="Confirme a nova senha" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
                  </div>
                </>}

                {feedback && (
                  <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`verify-email-feedback verify-email-feedback-${feedback.type}`}>
                    {feedback.text}
                  </div>
                )}

                <div className="verify-email-actions">
                  {hasContext && <Button
                    className="verify-email-primary"
                    onClick={handleVerify}
                    isLoading={isVerifying}
                    disabled={isResending}
                  >
                    Confirmar e-mail
                  </Button>}
                  <Button
                    variant="ghost"
                    className={hasContext ? 'verify-email-resend' : 'verify-email-primary'}
                    onClick={executeNormalResend}
                    isLoading={isResending}
                    disabled={cooldown > 0 || isVerifying}
                  >
                    {cooldown > 0 ? `Reenviar em ${cooldown} s` : 'Reenviar código'}
                  </Button>
                  <Link to="/login" onClick={() => { sessionStorage.removeItem('pendingToken'); sessionStorage.removeItem('pendingEmail'); }} className="verify-email-login">
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
                className="verify-email-heading verify-email-main verify-email-success"
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
        </div>

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
