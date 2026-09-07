import prisma from '../db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RegisterInput } from '../schemas/user.schema.js';
import { sendVerificationEmail, sendRegistrationAttemptEmail } from './email.service.js';

export async function createUser(data: RegisterInput) {
  // 1. Verifica se o usuário já existe no DB
  const existingUser = await prisma.user.findFirst({
    where: { email: data.email },
  });

  if (existingUser) {
    const now = Date.now();
    const lastResend = existingUser.lastResendAt ? existingUser.lastResendAt.getTime() : 0;
    let attempts = existingUser.resendAttempts || 0;

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

    if (existingUser.emailVerified) {
      // Cenário 2: Usuário já verificado
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          resendAttempts: attempts + 1,
          lastResendAt: new Date(),
        },
      });

      try {
        await sendRegistrationAttemptEmail(existingUser.email);
        await prisma.user.update({ where: { id: existingUser.id }, data: { lastEmailDeliveryFailedAt: null } });
      } catch (error: any) {
        console.error(`[EMAIL_DELIVERY_FAILED] Falha ao enviar email (attempt) para ${existingUser.email}. Motivo:`, error.message);
        await prisma.user.update({ where: { id: existingUser.id }, data: { lastEmailDeliveryFailedAt: new Date() } });
      }

      // Retorna usuário Dummy com ID aleatório
      return {
        id: crypto.randomUUID(),
        email: data.email,
        createdAt: new Date(),
      };
    }

    // Cenário 3: Usuário existe mas não verificou o e-mail
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        password: hashedPassword,
        resendAttempts: attempts + 1,
        lastResendAt: new Date(),
      },
    });

    try {
      await sendVerificationEmail(user.id, user.email);
      await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: null } });
    } catch (error: any) {
      console.error(`[EMAIL_DELIVERY_FAILED] Falha ao enviar email de verificacao para ${user.email}. Motivo:`, error.message);
      await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: new Date() } });
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  // Cenário 1: Usuário não existe
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      resendAttempts: 1,
      lastResendAt: new Date(),
    },
  });

  try {
    await sendVerificationEmail(user.id, user.email);
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error(`[EMAIL_DELIVERY_FAILED] Falha ao enviar email de verificacao para ${user.email}. Motivo:`, error.message);
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}
