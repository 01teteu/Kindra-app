/** SEC-03 regression: repeated registration must never grant control of an existing account. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import bcrypt from 'bcryptjs';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { createTestDatabase } from './postgresql-test-db.js';
import { hashAuthCode } from '../security/auth-code.js';

process.env.NODE_ENV = 'test';
const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { userRoutes } = await import('../routes/user.routes.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.ready();

const originalEmail = 'registration-owner@example.test';
const originalPassword = 'Owner-password-123!';
const attackerPassword = 'Attacker-password-456!';

async function captureRegistrationCode(action: () => Promise<unknown>) {
  const originalLog = console.log;
  let code = '';
  let pendingToken = '';
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (line.includes(`[MOCK EMAIL] Código de Verificação para ${originalEmail}:`)) {
      code = line.match(/: (\d{6})$/)?.[1] ?? '';
    }
    if (line.includes(`[MOCK EMAIL] Link de Verificação para ${originalEmail}:`)) {
      pendingToken = line.split('#token=')[1] ?? '';
    }
  };
  try {
    await action();
  } finally {
    console.log = originalLog;
  }
  return { code, pendingToken };
}

try {
  let firstResponse: Awaited<ReturnType<typeof app.inject>> | undefined;
  const { code: verificationCode, pendingToken } = await captureRegistrationCode(async () => {
    firstResponse = await app.inject({
      method: 'POST', url: '/api/users/register',
      payload: { email: originalEmail },
    });
  });
  assert.ok(firstResponse);
  assert.equal(firstResponse.statusCode, 202);
  assert.match(verificationCode, /^\d{6}$/);
  const firstBody = firstResponse.json();
  assert.equal(firstBody.pendingToken, undefined);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: originalEmail } });
  assert.equal(app.jwt.verify<{ id: string; scope: string }>(pendingToken).id, owner.id);
  assert.equal(app.jwt.verify<{ id: string; scope: string }>(pendingToken).scope, 'pending_verification');
  assert.equal(owner.password, null);
  const originalToken = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } });
  assert.equal(originalToken.token, hashAuthCode('email-verification', verificationCode));
  assert.equal(originalToken.issuedToEmail, originalEmail);

  const ownerBeforeDuplicate = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  const tokenBeforeDuplicate = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } });
  const duplicate = await app.inject({
    method: 'POST', url: '/api/users/register',
    payload: { email: originalEmail, password: attackerPassword },
  });
  assert.equal(duplicate.statusCode, 202);
  const duplicateBody = duplicate.json();
  assert.deepEqual(duplicateBody, firstBody);
  assert.equal(duplicateBody.pendingToken, undefined);
  assert.equal(duplicateBody.user, undefined);
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }), ownerBeforeDuplicate);
  assert.deepEqual(await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } }), tokenBeforeDuplicate);
  assert.equal(ownerBeforeDuplicate.password, null);

  const unauthorisedChange = await app.inject({
    method: 'POST', url: '/api/auth/verify-email/change',
    payload: { newEmail: 'attacker@example.test' },
  });
  assert.equal(unauthorisedChange.statusCode, 401);
  assert.equal(await prisma.user.count({ where: { email: 'attacker@example.test' } }), 0);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/auth/verify-email/confirm', payload: { token: '000000' },
  })).statusCode, 401);

  const confirmation = await app.inject({
    method: 'POST', url: '/api/auth/verify-email/confirm',
    headers: { authorization: `Bearer ${pendingToken}` }, payload: { token: verificationCode, password: originalPassword, confirmPassword: originalPassword },
  });
  assert.equal(confirmation.statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, true);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/auth/login', payload: { email: originalEmail, password: originalPassword },
  })).statusCode, 200);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/auth/login', payload: { email: originalEmail, password: attackerPassword },
  })).statusCode, 401);

  const verifiedBeforeDuplicate = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
  const verifiedDuplicate = await app.inject({
    method: 'POST', url: '/api/users/register',
    payload: { email: originalEmail, password: attackerPassword },
  });
  assert.equal(verifiedDuplicate.statusCode, 202);
  assert.deepEqual(verifiedDuplicate.json(), firstBody);
  assert.equal(verifiedDuplicate.json().pendingToken, undefined);
  assert.equal(verifiedDuplicate.json().user, undefined);
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }), verifiedBeforeDuplicate);

  console.log('PASS SEC-03: cadastro novo e verificação funcionam; duplicatas não alteram conta, token ou senha e não concedem pendingToken.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
