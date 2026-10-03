import prisma from '../db.js';
import { RegisterInput } from '../schemas/user.schema.js';
import { sendVerificationEmail, type SignVerificationContext } from './email.service.js';
import { Prisma } from '@prisma/client';

type RegisteredUser = {
  id: string;
  email: string;
  createdAt: Date;
};

export type CreateUserResult =
  | { outcome: 'created'; user: RegisteredUser }
  | { outcome: 'existing' };

export async function createUser(data: RegisterInput, signContext: SignVerificationContext): Promise<CreateUserResult> {
  // 1. Verifica se o usuário já existe no DB
  const existingUser = await prisma.user.findFirst({
    where: { email: data.email },
  });

  if (existingUser) {
    // A repeated public registration proves no ownership of the address. Keep the
    // account and its current verification token untouched and reveal no identity.
    return { outcome: 'existing' };
  }

  // Cenário 1: Usuário não existe
  let user;
  try {
    user = await prisma.user.create({
      data: { email: data.email, password: null, resendAttempts: 1, lastResendAt: new Date() },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { outcome: 'existing' };
    }
    throw error;
  }

  try {
    await sendVerificationEmail(user.id, user.email, signContext);
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: null } });
  } catch (error: any) {
    console.error('[EMAIL_DELIVERY_FAILED] Falha ao enviar email de verificacao.');
    await prisma.user.update({ where: { id: user.id }, data: { lastEmailDeliveryFailedAt: new Date() } });
  }

  return {
    outcome: 'created',
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    },
  };
}
