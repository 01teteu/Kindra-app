/** SEC-05 regression: a successful password reset revokes every older session JWT. */
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

const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { requireScope } = await import('../middlewares/auth.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(authRoutes, { prefix: '/api/auth' });
app.get('/protected', { preHandler: requireScope('session') }, async request => request.user);
await app.ready();

const email = 'session-revocation@example.test';
const oldPassword = 'Session-owner-123!';
const newPassword = 'Session-owner-456!';
const user = await prisma.user.create({
  data: { email, password: await bcrypt.hash(oldPassword, 10), emailVerified: true },
});

async function login(password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}

function sessionCookie(response: Awaited<ReturnType<typeof app.inject>>) {
  const value = response.cookies.find(item => item.name === 'token')?.value;
  assert.equal(typeof value, 'string');
  return value!;
}

async function protectedStatus(token: string) {
  return (await app.inject({ url: '/protected', cookies: { token } })).statusCode;
}

async function issueResetCode(code: string, expired = false) {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  return prisma.passwordResetToken.create({ data: {
    userId: user.id,
    token: hashAuthCode('password-reset', code),
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)),
  } });
}

try {
  const column = await prisma.$queryRaw<Array<{ column_default: string | null; is_nullable: string }>>`
    SELECT column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'sessionVersion'
  `;
  assert.equal(column.length, 1);
  assert.equal(column[0].column_default, '0');
  assert.equal(column[0].is_nullable, 'NO');
  assert.equal(user.sessionVersion, 0);

  const loginA = await login(oldPassword);
  const loginB = await login(oldPassword);
  assert.equal(loginA.statusCode, 200);
  assert.equal(loginB.statusCode, 200);
  const sessionA = sessionCookie(loginA);
  const sessionB = sessionCookie(loginB);
  const legacySession = app.jwt.sign({ id: user.id, scope: 'session' });
  assert.equal(await protectedStatus(sessionA), 200);
  assert.equal(await protectedStatus(sessionB), 200);
  assert.equal(await protectedStatus(legacySession), 200);
  assert.equal(loginA.json().user.sessionVersion, undefined);

  await issueResetCode('111111');
  const invalid = await app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', payload: { email, token: '999999' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().resetToken, undefined);
  assert.equal(await protectedStatus(sessionA), 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 0);

  await issueResetCode('222222', true);
  const expired = await app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', payload: { email, token: '222222' },
  });
  assert.equal(expired.statusCode, 400);
  assert.equal(expired.json().resetToken, undefined);
  assert.equal(await protectedStatus(sessionB), 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 0);

  await issueResetCode('333333');
  const verified = await app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', payload: { email, token: '333333' },
  });
  assert.equal(verified.statusCode, 200);
  const resetToken = verified.json().resetToken;
  assert.equal(typeof resetToken, 'string');
  assert.equal(await protectedStatus(resetToken), 403);
  assert.equal(await protectedStatus(app.jwt.sign({ id: user.id, scope: 'pending_verification' })), 403);

  const reset = await app.inject({
    method: 'POST', url: '/api/auth/reset-password',
    headers: { authorization: `Bearer ${resetToken}` },
    payload: { password: newPassword, confirmPassword: newPassword },
  });
  assert.equal(reset.statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
  const replay = await app.inject({
    method: 'POST', url: '/api/auth/reset-password',
    headers: { authorization: `Bearer ${resetToken}` },
    payload: { password: 'Session-replay-456!', confirmPassword: 'Session-replay-456!' },
  });
  assert.equal(replay.statusCode, 401);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
  assert.equal(await protectedStatus(sessionA), 401);
  assert.equal(await protectedStatus(sessionB), 401);
  assert.equal(await protectedStatus(legacySession), 401);

  assert.equal((await login(oldPassword)).statusCode, 401);
  const loginC = await login(newPassword);
  assert.equal(loginC.statusCode, 200);
  const sessionC = sessionCookie(loginC);
  assert.equal(app.jwt.verify<{ sessionVersion: number }>(sessionC).sessionVersion, 1);
  assert.equal(await protectedStatus(sessionC), 200);

  console.log('PASS SEC-05: migration aplicada; sessões antigas revogadas após reset; login novo e tokens temporários preservados.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
