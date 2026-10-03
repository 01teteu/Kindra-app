import crypto from 'node:crypto';
import prisma from '../db.js';
import type { Prisma } from '@prisma/client';
import { hashAuthCode } from '../security/auth-code.js';
import { getEmailAppUrl, sendTransactionalEmail } from './transactional-email.provider.js';
import { verificationEmail, passwordResetEmail, registrationAttemptEmail, passwordChangedEmail } from './email-templates.js';

export type SignVerificationContext = (userId: string, challengeId: string, email: string) => Promise<string>;

/** The caller holds the user row lock while replacing the challenge. */
export async function createVerificationChallenge(db: Prisma.TransactionClient, userId: string, email: string) {
  const code = crypto.randomInt(100000, 999999).toString();
  const hashedToken = hashAuthCode('email-verification', code);
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  await db.emailVerificationToken.deleteMany({ where: { userId } });
  const challenge = await db.emailVerificationToken.create({
    data: { token: hashedToken, userId, expiresAt, issuedToEmail: email, attempts: 0 },
  });
  return { code, challengeId: challenge.id };
}

export async function sendVerificationEmail(userId: string, email: string, signContext: SignVerificationContext) {
  const issued = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
    if (!user || user.emailVerified || user.email !== email) throw new Error('VERIFICATION_ACCOUNT_CHANGED');
    return createVerificationChallenge(tx, userId, email);
  });
  const pendingToken = await signContext(userId, issued.challengeId, email);
  await deliverVerificationEmail(email, issued.code, pendingToken);
}

function mockDetailsAllowed() {
  return process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV !== 'production' && process.env.EMAIL_MOCK_DEBUG === '1');
}

export async function deliverVerificationEmail(email: string, code: string, pendingToken: string) {
  const appUrl = getEmailAppUrl();
  const link = `${appUrl}/verificar-email#token=${encodeURIComponent(pendingToken)}`;
  if (process.env.NODE_ENV !== 'production') {
    if (mockDetailsAllowed()) {
      // Existing test fixtures read these two lines; never print them in production.
      console.log(`[MOCK EMAIL] Código de Verificação para ${email}: ${code}`);
      console.log(`[MOCK EMAIL] Link de Verificação para ${email}: ${link}`);
    } else {
      console.log('[MOCK EMAIL] Verificação simulada.');
    }
  }
  await sendTransactionalEmail(verificationEmail(email, code, link));
}

export async function sendPasswordResetEmail(userId: string, email: string) {
  const code = crypto.randomInt(100000, 999999).toString();
  const hashedToken = hashAuthCode('password-reset', code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Preserve the existing replacement and expiry semantics of reset challenges.
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.create({ data: { token: hashedToken, userId, expiresAt } });

  if (process.env.NODE_ENV !== 'production') {
    if (mockDetailsAllowed()) {
      console.log(`[MOCK EMAIL] Código de Redefinição para ${email}: ${code}`);
    } else {
      console.log('[MOCK EMAIL] Recuperação simulada.');
    }
  }
  await sendTransactionalEmail(passwordResetEmail(email, code, getEmailAppUrl()));
}

export async function sendRegistrationAttemptEmail(email: string) {
  await sendTransactionalEmail(registrationAttemptEmail(email, getEmailAppUrl()));
}

export async function sendPasswordChangedNotification(email: string) {
  await sendTransactionalEmail(passwordChangedEmail(email, getEmailAppUrl()));
}
