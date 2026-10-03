import prisma from '../db.js';
import bcrypt from 'bcryptjs';
import { LoginInput, ConfirmVerificationInput, ForgotPasswordInput, VerifyResetCodeInput, ResetPasswordInput, GoogleAuthInput } from '../schemas/auth.schema.js';
import { createVerificationChallenge, deliverVerificationEmail, sendPasswordResetEmail, sendPasswordChangedNotification, sendRegistrationAttemptEmail, type SignVerificationContext } from './email.service.js';
import { hashAuthCode, verifyAuthCodeDigest } from '../security/auth-code.js';
import { randomUUID } from 'node:crypto';
import { verifyGoogleIdentity } from '../security/google-id-token.js';

const dummyPasswordHash = bcrypt.hashSync('kindra-invalid-login', 10);

export async function loginWithGoogle(data: GoogleAuthInput) {
  const { sub, email } = await verifyGoogleIdentity(data.credential);
  const linkedUser = await prisma.user.findUnique({
    where: { googleSub: sub },
    include: { profile: true }
  });
  if (linkedUser) {
    return {
      id: linkedUser.id,
      email: linkedUser.email,
      role: linkedUser.role,
      hasProfile: !!linkedUser.profile,
      sessionVersion: linkedUser.sessionVersion,
    };
  }

  // Email collisions, including legacy Google accounts, require explicit linking.
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new Error('INVALID_GOOGLE_TOKEN');
  }

  try {
    const newUser = await prisma.user.create({
      data: {
        email,
        googleSub: sub,
        password: null,
        provider: 'GOOGLE',
        emailVerified: true,
      },
      include: { profile: true }
    });
    return {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      hasProfile: false,
      sessionVersion: newUser.sessionVersion,
    };
  } catch (error: any) {
    // A concurrent first login may have created the same subject. Never resolve
    // a uniqueness conflict by email, which could belong to another identity.
    if (error?.code === 'P2002') {
      const concurrentUser = await prisma.user.findUnique({
        where: { googleSub: sub }, include: { profile: true }
      });
      if (concurrentUser) {
        return {
          id: concurrentUser.id,
          email: concurrentUser.email,
          role: concurrentUser.role,
          hasProfile: !!concurrentUser.profile,
          sessionVersion: concurrentUser.sessionVersion,
        };
      }
      throw new Error('INVALID_GOOGLE_TOKEN');
    }
    throw error;
  }
}

export async function login(data: LoginInput) {
  // 1. Busca o usuário
  const user = await prisma.user.findFirst({
    where: { email: data.email },
    include: { profile: true } // We add profile check here
  });

  // Compare mesmo sem hash para evitar um caminho estruturalmente mais rápido.
  const isValidPassword = await bcrypt.compare(data.password, user?.password ?? dummyPasswordHash);
  if (!user || !user.password || !user.emailVerified || !isValidPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // 5. Retorna dados necessários para gerar o JWT
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasProfile: !!user.profile,
    sessionVersion: user.sessionVersion,
  };
}

export async function verifyEmailToken(userId: string, challengeId: string, data: ConfirmVerificationInput) {
  const outcome = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user || user.emailVerified) return { error: 'INVALID_TOKEN' } as const;

    const challenge = await tx.emailVerificationToken.findFirst({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!challenge || challenge.id !== challengeId) return { error: 'INVALID_TOKEN' } as const;
    if (!challenge.issuedToEmail) return { error: 'TOKEN_REISSUE_REQUIRED' } as const;
    if (challenge.issuedToEmail !== user.email) return { error: 'INVALID_TOKEN' } as const;
    if (new Date() > challenge.expiresAt) return { error: 'TOKEN_EXPIRED' } as const;
    if (challenge.attempts >= 5) return { error: 'MAX_VALIDATION_ATTEMPTS' } as const;

    if (!verifyAuthCodeDigest(challenge.token, 'email-verification', data.token)) {
      if (challenge.attempts + 1 >= 5) {
        await tx.emailVerificationToken.delete({ where: { id: challenge.id } });
        return { error: 'MAX_VALIDATION_ATTEMPTS' } as const;
      }
      await tx.emailVerificationToken.update({
        where: { id: challenge.id }, data: { attempts: { increment: 1 } },
      });
      return { error: 'INVALID_TOKEN' } as const;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    await tx.emailVerificationToken.delete({ where: { id: challenge.id } });
    const verified = await tx.user.update({
      where: { id: userId }, data: { emailVerified: true, password: hashedPassword }, include: { profile: true },
    });
    return { user: verified } as const;
  });

  // Returning an outcome rather than throwing inside the transaction commits
  // incorrect attempts, including the fifth attempt that locks the challenge.
  if ('error' in outcome) throw new Error(outcome.error);
  const user = outcome.user;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasProfile: !!user.profile,
    sessionVersion: user.sessionVersion,
  };
}

export async function resendVerificationEmailService(email: string, signContext: SignVerificationContext) {
  const issued = await prisma.$transaction(async tx => {
    const matched = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!matched) return null;
    const userId = matched.id;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified || user.provider === 'GOOGLE') return null;

    const lastResend = user.lastResendAt ? user.lastResendAt.getTime() : 0;
    const now = Date.now();
    const attempts = lastResend > 0 && now - lastResend > 24 * 60 * 60 * 1000 ? 0 : user.resendAttempts;
    let cooldown = 0;
    if (attempts === 1) cooldown = 30 * 1000;
    else if (attempts === 2) cooldown = 80 * 1000;
    else if (attempts === 3) cooldown = 150 * 1000;
    else if (attempts >= 4) return null;
    if (now < lastResend + cooldown) return null;

    await tx.user.update({ where: { id: userId }, data: { resendAttempts: attempts + 1, lastResendAt: new Date(now) } });
    const challenge = await createVerificationChallenge(tx, userId, user.email);
    return { userId, email: user.email, ...challenge };
  });
  if (!issued) return;
  try {
    const pendingToken = await signContext(issued.userId, issued.challengeId, issued.email);
    await deliverVerificationEmail(issued.email, issued.code, pendingToken);
    await prisma.user.update({ where: { id: issued.userId }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error('[EMAIL_DELIVERY_FAILED] Falha ao reenviar email de verificacao.');
    await prisma.user.update({ where: { id: issued.userId }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }
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

  try {
    await sendPasswordResetEmail(user.id, user.email);
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error('[EMAIL_DELIVERY_FAILED] Falha ao enviar reset de senha.');
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }
}

export async function verifyResetCodeService(data: VerifyResetCodeInput) {
  const outcome = await prisma.$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { email: data.email } });
    if (!user || !user.emailVerified) return { error: 'INVALID_TOKEN' } as const;

    const tokens = await tx.$queryRaw<Array<{
      id: string;
      token: string;
      used: boolean;
      attempts: number;
      expiresAt: Date;
    }>>`
      SELECT id, token, used, attempts, "expiresAt"
      FROM password_reset_tokens
      WHERE "userId" = ${user.id}
      ORDER BY "createdAt" DESC
      LIMIT 1
      FOR UPDATE
    `;
    const tokenRecord = tokens[0];
    if (!tokenRecord) return { error: 'INVALID_TOKEN' } as const;
    if (tokenRecord.used) return { error: 'TOKEN_ALREADY_USED' } as const;

    if (tokenRecord.attempts >= 5) {
      await tx.passwordResetToken.update({ where: { id: tokenRecord.id }, data: { used: true } });
      return { error: 'MAX_VALIDATION_ATTEMPTS' } as const;
    }
    if (new Date() > tokenRecord.expiresAt) return { error: 'TOKEN_EXPIRED' } as const;

    if (!verifyAuthCodeDigest(tokenRecord.token, 'password-reset', data.token)) {
      await tx.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return { error: 'INVALID_TOKEN' } as const;
    }

    const resetGrantId = randomUUID();
    await tx.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { used: true, resetGrantId },
    });
    return { user, challengeId: tokenRecord.id, resetGrantId } as const;
  });

  if ('error' in outcome) throw new Error(outcome.error);
  return outcome;
}

export async function resetPasswordService(userId: string, challengeId: string, resetGrantId: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const user = await prisma.$transaction(async tx => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: challengeId, userId, used: true, resetGrantId },
      data: { resetGrantId: null },
    });
    if (consumed.count !== 1) throw new Error('INVALID_RESET_GRANT');
    return tx.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
    });
  });

  try {
    await sendPasswordChangedNotification(user.email);
    await prisma.user.update({ where: { id: userId }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error('[EMAIL_DELIVERY_FAILED] Falha ao enviar notificacao de alteracao de senha.');
    await prisma.user.update({ where: { id: userId }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }
}

export async function changeUnverifiedEmailService(userId: string, challengeId: string, newEmail: string, signContext: SignVerificationContext) {
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.emailVerified) throw new Error('EMAIL_ALREADY_VERIFIED');
    const currentChallenge = await tx.emailVerificationToken.findFirst({ where: { userId } });
    if (!currentChallenge || currentChallenge.id !== challengeId || currentChallenge.issuedToEmail !== user.email || currentChallenge.expiresAt < new Date()) {
      throw new Error('INVALID_TOKEN');
    }

    const existing = await tx.user.findUnique({ where: { email: newEmail } });
    if (existing) return { existingEmail: existing.email } as const;

    // Changing the destination consumes the same daily issuance budget as resend.
    // Resetting that counter would allow unlimited new five-attempt challenges.
    const now = Date.now();
    const lastResend = user.lastResendAt ? user.lastResendAt.getTime() : 0;
    const attempts = lastResend > 0 && now - lastResend > 24 * 60 * 60 * 1000 ? 0 : user.resendAttempts;
    if (attempts >= 4) throw new Error('MAX_ATTEMPTS_REACHED');

    await tx.user.update({ where: { id: userId }, data: {
      email: newEmail, resendAttempts: attempts + 1, lastResendAt: new Date(now),
    } });
    const issued = await createVerificationChallenge(tx, userId, newEmail);
    return issued;
  });

  if ('existingEmail' in result) {
    try {
      await sendRegistrationAttemptEmail(result.existingEmail);
      await prisma.user.update({ where: { email: result.existingEmail }, data: { lastEmailDeliveryFailedAt: null } });
    } catch (error: any) {
      console.error('[EMAIL_DELIVERY_FAILED] Falha ao notificar tentativa de troca de email.');
      await prisma.user.update({ where: { email: result.existingEmail }, data: { lastEmailDeliveryFailedAt: new Date() } });
    }
    return;
  }

  try {
    const pendingToken = await signContext(userId, result.challengeId, newEmail);
    await deliverVerificationEmail(newEmail, result.code, pendingToken);
    await prisma.user.update({ where: { id: userId }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error('[EMAIL_DELIVERY_FAILED] Falha ao enviar verificacao de novo email.');
    await prisma.user.update({ where: { id: userId }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }

}
