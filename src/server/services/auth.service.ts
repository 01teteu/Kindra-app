import prisma from '../db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from "google-auth-library";
import { LoginInput, ConfirmVerificationInput, ForgotPasswordInput, VerifyResetCodeInput, ResetPasswordInput, GoogleAuthInput } from '../schemas/auth.schema.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedNotification, sendRegistrationAttemptEmail } from './email.service.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function loginWithGoogle(data: GoogleAuthInput) {
  let email = '';
  
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: data.credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
    
    // Check if google has verified this email
    if (!payload.email_verified) {
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
    
    email = payload.email;
  } catch(e) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }

  // 2. Busca se o usuário já existe
  const existingUser = await prisma.user.findFirst({
    where: { email },
    include: { profile: true }
  });

  if (!existingUser) {
    // Caso 1: Usuário não existe, criamos uma conta Google
    const newUser = await prisma.user.create({
      data: {
        email,
        password: null, // Sem senha
        provider: 'GOOGLE',
        emailVerified: true // Garantido pelo Google
      },
      include: { profile: true }
    });

    return {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      hasProfile: false
    };
  }

  // Caso 2: O e-mail já existe, mas NÃO está verificado (Modo Sobrescrita)
  if (!existingUser.emailVerified) {
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        password: null, // Destruímos a senha do atacante
        provider: 'GOOGLE',
        emailVerified: true, // Google confirmou a identidade agora
      },
      include: { profile: true }
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      hasProfile: !!updatedUser.profile
    };
  }

  // Caso 3: O e-mail já existe e ESTÁ verificado (Dono legítimo logando)
  return {
    id: existingUser.id,
    email: existingUser.email,
    role: existingUser.role,
    hasProfile: !!existingUser.profile
  };
}

export async function login(data: LoginInput) {
  // 1. Busca o usuário
  const user = await prisma.user.findFirst({
    where: { email: data.email },
    include: { profile: true } // We add profile check here
  });

  // 2. Se não existir, erro genérico
  if (!user || !user.password) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // 3. Valida a senha
  const isValidPassword = await bcrypt.compare(data.password, user.password);
  if (!isValidPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // 4. Verifica se o e-mail foi confirmado
  if (!user.emailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  // 5. Retorna dados necessários para gerar o JWT
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasProfile: !!user.profile
  };
}

export async function verifyEmailToken(data: ConfirmVerificationInput) {
  // 1. Gera o hash do token fornecido
  const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

  // 2. Busca o token no banco
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { token: hashedToken }
  });

  if (!verificationToken) {
    throw new Error('INVALID_TOKEN');
  }

  // 3. Verifica se expirou
  if (new Date() > verificationToken.expiresAt) {
    throw new Error('TOKEN_EXPIRED');
  }

  // 4. Marca usuário como verificado
  const user = await prisma.user.update({
    where: { id: verificationToken.userId },
    data: { emailVerified: true },
    include: { profile: true }
  });

  // 5. Deleta o token (uso único)
  await prisma.emailVerificationToken.delete({
    where: { id: verificationToken.id }
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasProfile: !!user.profile
  };
}

export async function resendVerificationEmailService(email: string) {
  const user = await prisma.user.findFirst({
    where: { email }
  });

  if (!user) {
    // Retornamos sucesso mesmo se o usuário não existir para evitar User Enumeration
    return;
  }

  if (user.emailVerified) {
    throw new Error('EMAIL_ALREADY_VERIFIED');
  }

  const lastResend = user.lastResendAt ? user.lastResendAt.getTime() : 0;
  const now = Date.now();
  let attempts = user.resendAttempts;
  
  // Se já passou de 24 horas desde o último envio, zera as tentativas
  if (lastResend > 0 && (now - lastResend) > 24 * 60 * 60 * 1000) {
    attempts = 0;
  }

  let cooldown = 0;
  if (attempts === 1) cooldown = 30 * 1000;
  else if (attempts === 2) cooldown = 80 * 1000;
  else if (attempts === 3) cooldown = 150 * 1000;
  else if (attempts >= 4) {
    throw new Error('MAX_ATTEMPTS_REACHED');
  }

  if (now < lastResend + cooldown) {
    const remaining = Math.ceil((lastResend + cooldown - now) / 1000);
    const err = new Error('COOLDOWN_ACTIVE');
    (err as any).retryAfter = remaining;
    throw err;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resendAttempts: attempts + 1,
      lastResendAt: new Date()
    }
  });

  await sendVerificationEmail(user.id, user.email);
}

export async function forgotPasswordService(email: string) {
  const user = await prisma.user.findFirst({
    where: { email }
  });

  // Retornamos silenciosamente para evitar User Enumeration
  if (!user || !user.emailVerified) {
    return;
  }

  // Se o usuário for exclusivamento do Google, não enviamos email de reset e informamos
  if (user.provider === 'GOOGLE' && !user.password) {
    throw new Error('GOOGLE_USER_NO_PASSWORD');
  }

  const lastResend = user.lastResetResendAt ? user.lastResetResendAt.getTime() : 0;
  const now = Date.now();
  let attempts = user.resetResendAttempts;

  // Se já passou de 24 horas, zera as tentativas
  if (lastResend > 0 && (now - lastResend) > 24 * 60 * 60 * 1000) {
    attempts = 0;
  }

  let cooldown = 0;
  if (attempts === 1) cooldown = 30 * 1000;
  else if (attempts === 2) cooldown = 80 * 1000;
  else if (attempts === 3) cooldown = 150 * 1000;
  else if (attempts >= 4) {
    throw new Error('MAX_ATTEMPTS_REACHED');
  }

  if (now < lastResend + cooldown) {
    const remaining = Math.ceil((lastResend + cooldown - now) / 1000);
    const err = new Error('COOLDOWN_ACTIVE');
    (err as any).retryAfter = remaining;
    throw err;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetResendAttempts: attempts + 1,
      lastResetResendAt: new Date()
    }
  });

  await sendPasswordResetEmail(user.id, user.email);
}

export async function verifyResetCodeService(data: VerifyResetCodeInput) {
  const user = await prisma.user.findFirst({
    where: { email: data.email }
  });

  if (!user || !user.emailVerified) {
    throw new Error('INVALID_TOKEN'); // Mensagem genérica
  }

  const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!tokenRecord) {
    throw new Error('INVALID_TOKEN');
  }

  if (tokenRecord.used) {
    throw new Error('TOKEN_ALREADY_USED');
  }

  if (tokenRecord.attempts >= 5) {
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { used: true }
    });
    throw new Error('MAX_VALIDATION_ATTEMPTS');
  }

  if (new Date() > tokenRecord.expiresAt) {
    throw new Error('TOKEN_EXPIRED');
  }

  if (tokenRecord.token !== hashedToken) {
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { attempts: tokenRecord.attempts + 1 }
    });
    throw new Error('INVALID_TOKEN');
  }

  // Token válido, marcaremos como usado para que não seja tentado novamente,
  // mas o fluxo agora passa a depender do JWT que será gerado.
  await prisma.passwordResetToken.update({
    where: { id: tokenRecord.id },
    data: { used: true }
  });

  return user;
}

export async function resetPasswordService(userId: string, newPassword: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId }
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });

  await sendPasswordChangedNotification(user.email);
}

export async function changeUnverifiedEmailService(oldEmail: string, newEmail: string) {
  // 1. Encontra o usuário pelo email antigo
  const user = await prisma.user.findFirst({
    where: { email: oldEmail }
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // 2. Regra restrita: Só permite alterar se o email ainda NÃO foi verificado
  if (user.emailVerified) {
    throw new Error('EMAIL_ALREADY_VERIFIED');
  }

  // 3. Verifica se o novo e-mail já não está em uso por outra conta
  const newEmailExists = await prisma.user.findFirst({
    where: { email: newEmail }
  });

  if (newEmailExists) {
    // Alerta o dono real e retorna sucesso silencioso para quem tentou usar
    await sendRegistrationAttemptEmail(newEmailExists.email);
    return;
  }

  // 4. Atualiza o e-mail no banco e reseta as tentativas de envio
  await prisma.user.update({
    where: { id: user.id },
    data: { 
      email: newEmail,
      resendAttempts: 0,
      lastResendAt: null
    }
  });

  // 5. Envia o novo token de verificação. 
  // (A função sendVerificationEmail internamente deleta tokens antigos automaticamente)
  await sendVerificationEmail(user.id, newEmail);
}
