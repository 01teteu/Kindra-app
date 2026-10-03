/** AUD-05: public registration/login/resend reveal no account state; verification requires email context. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from './postgresql-test-db.js';
import { hashAuthCode } from '../security/auth-code.js';

const previousEnvironment = process.env.NODE_ENV;
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

let ip = 1;
const nextAddress = () => `127.31.${Math.floor(ip / 250)}.${ip++ % 250 + 1}`;
const password = 'Aud05-password-123!';
const register = (email: string) => app.inject({ method: 'POST', url: '/api/users/register', remoteAddress: nextAddress(), payload: { email } });
const resend = (email: string) => app.inject({ method: 'POST', url: '/api/auth/verify-email/send', remoteAddress: nextAddress(), payload: { email } });
const login = (email: string, pass = password) => app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: nextAddress(), payload: { email, password: pass } });

async function capture(email: string, action: () => Promise<unknown>) {
  const original = console.log;
  let code = '';
  let token = '';
  let calls = 0;
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (line.includes(`[MOCK EMAIL] Código de Verificação para ${email}:`)) {
      code = line.match(/: (\d{6})$/)?.[1] ?? '';
      calls++;
    }
    if (line.includes(`[MOCK EMAIL] Link de Verificação para ${email}:`)) token = line.split('#token=')[1] ?? '';
  };
  let response: unknown;
  try { response = await action(); } finally { console.log = original; }
  return { response: response as Awaited<ReturnType<typeof app.inject>>, code, token, calls };
}

try {
  const verified = await prisma.user.create({ data: { email: 'aud05-verified@example.test', emailVerified: true, password: await bcrypt.hash(password, 10) } });
  const google = await prisma.user.create({ data: { email: 'aud05-google@example.test', provider: 'GOOGLE', emailVerified: true, password: null } });
  const pending = await prisma.user.create({ data: { email: 'aud05-pending@example.test', password: null } });
  const before = await Promise.all([verified, google, pending].map(user => prisma.user.findUniqueOrThrow({ where: { id: user.id } })));

  const freshEmail = 'aud05-new@example.test';
  const fresh = await capture(freshEmail, () => register(freshEmail));
  const freshUser = await prisma.user.findUniqueOrThrow({ where: { email: freshEmail } });
  assert.equal(fresh.response.statusCode, 202);
  assert.deepEqual(fresh.response.json(), { message: 'Se este endereço puder ser cadastrado, enviaremos instruções para continuar.' });
  assert.equal(freshUser.password, null);
  assert.equal(fresh.calls, 1);
  assert.match(fresh.code, /^\d{6}$/);
  assert.ok(fresh.token);
  const initialChallenge = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: freshUser.id } });
  const claims = app.jwt.verify<{ id: string; scope: string; challengeId: string }>(fresh.token);
  assert.equal(claims.id, freshUser.id);
  assert.equal(claims.scope, 'pending_verification');
  assert.equal(claims.challengeId, initialChallenge.id);

  const duplicates = await Promise.all([freshEmail, verified.email, pending.email, google.email].map(register));
  for (const response of duplicates) {
    assert.equal(response.statusCode, 202);
    assert.equal(response.body, fresh.response.body);
    assert.equal(response.headers['content-type'], fresh.response.headers['content-type']);
    assert.equal(response.headers['content-length'], fresh.response.headers['content-length']);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  for (let index = 0; index < before.length; index++) {
    assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: before[index].id } }), before[index]);
  }
  assert.deepEqual(await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: freshUser.id } }), initialChallenge);
  assert.equal((await register('invalid')).statusCode, 400);

  const raceEmail = 'aud05-race@example.test';
  const originalLog = console.log;
  console.log = () => {};
  let raced: Awaited<ReturnType<typeof app.inject>>[];
  try { raced = await Promise.all(Array.from({ length: 4 }, () => register(raceEmail))); }
  finally { console.log = originalLog; }
  assert.ok(raced.every(response => response.statusCode === 202 && response.body === fresh.response.body));
  assert.equal(await prisma.user.count({ where: { email: raceEmail } }), 1);
  assert.equal(await prisma.emailVerificationToken.count({ where: { user: { email: raceEmail } } }), 1);

  const compareOriginal = bcrypt.compare;
  let comparisons = 0;
  const compareMock = mock.method(bcrypt, 'compare', async (...args: Parameters<typeof bcrypt.compare>) => {
    comparisons++;
    return compareOriginal(...args);
  });
  try {
    const denied = await Promise.all([
      login('aud05-missing@example.test'), login(verified.email, 'wrong'),
      login(pending.email), login(google.email), login(freshEmail),
    ]);
    assert.equal(comparisons, denied.length);
    for (const response of denied) {
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: 'Credenciais inválidas.' });
      assert.equal(response.headers['set-cookie'], undefined);
    }
    assert.equal((await login(verified.email)).statusCode, 200);
  } finally { compareMock.mock.restore(); }

  const resendResponses = await Promise.all([
    resend('aud05-missing@example.test'), resend(verified.email), resend(google.email), resend(freshEmail),
  ]);
  for (const response of resendResponses) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, resendResponses[0].body);
    assert.equal(response.headers['content-type'], resendResponses[0].headers['content-type']);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  // The initial issuance starts the account cooldown. Once eligible, only the pending account receives context.
  await prisma.user.update({ where: { id: freshUser.id }, data: { lastResendAt: new Date(Date.now() - 60_000) } });
  const next = await capture(freshEmail, () => resend(freshEmail));
  assert.equal(next.calls, 1);
  assert.equal(next.response.body, resendResponses[0].body);
  assert.notEqual(app.jwt.verify<{ challengeId: string }>(next.token).challengeId, initialChallenge.id);
  assert.equal((await resend(freshEmail)).body, next.response.body);

  const confirm = (token: string, code: string, pass = password) => app.inject({
    method: 'POST', url: '/api/auth/verify-email/confirm', remoteAddress: nextAddress(),
    headers: { authorization: `Bearer ${token}` }, payload: { token: code, password: pass, confirmPassword: pass },
  });
  assert.equal((await confirm(fresh.token, fresh.code)).statusCode, 400);
  assert.equal((await confirm(next.token, '000000')).statusCode, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: freshUser.id } })).password, null);
  assert.equal((await confirm(app.jwt.sign({ id: freshUser.id, scope: 'pending_verification' }), next.code)).statusCode, 401);
  assert.equal((await confirm(app.jwt.sign({ id: verified.id, scope: 'pending_verification', challengeId: app.jwt.verify<{ challengeId: string }>(next.token).challengeId }), next.code)).statusCode, 400);
  const completed = await confirm(next.token, next.code);
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().user.hasProfile, false);
  assert.ok(completed.cookies.some(item => item.name === 'token'));
  assert.ok(await bcrypt.compare(password, (await prisma.user.findUniqueOrThrow({ where: { id: freshUser.id } })).password!));
  assert.equal((await confirm(next.token, next.code)).statusCode, 400);
  assert.equal((await login(freshEmail)).statusCode, 200);

  const rollbackUser = await prisma.user.create({ data: { email: 'aud05-rollback@example.test', password: null } });
  const rollbackChallenge = await prisma.emailVerificationToken.create({ data: {
    userId: rollbackUser.id, issuedToEmail: rollbackUser.email,
    token: hashAuthCode('email-verification', '654321'), expiresAt: new Date(Date.now() + 60_000),
  } });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION aud05_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.email = 'aud05-rollback@example.test' AND NEW."emailVerified" THEN
      RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER aud05_reject_update BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION aud05_reject_update()`);
  const rollbackToken = app.jwt.sign({ id: rollbackUser.id, scope: 'pending_verification', challengeId: rollbackChallenge.id });
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await confirm(rollbackToken, '654321')).statusCode, 500); }
  finally { console.error = originalError; }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: rollbackUser.id } })).password, null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: rollbackUser.id } })).emailVerified, false);
  assert.equal(await prisma.emailVerificationToken.count({ where: { id: rollbackChallenge.id } }), 1);

  const { deliverVerificationEmail } = await import('../services/email.service.js');
  const previousLog = console.log;
  let productionLogs = 0;
  console.log = () => { productionLogs++; };
  process.env.NODE_ENV = 'production';
  process.env.BREVO_API_KEY = '';
  try {
    await assert.rejects(deliverVerificationEmail('aud05@example.test', '123456', 'synthetic-token'), /BREVO_API_KEY_INVALID/);
  } finally {
    process.env.NODE_ENV = 'test';
    console.log = previousLog;
  }
  assert.equal(productionLogs, 0);

  // Isolated limiter instance avoids sharing buckets with the account-state matrix above.
  const limitApp = Fastify({ logger: false });
  try {
    await limitApp.register(cookie);
    await limitApp.register(jwt, { secret: randomBytes(32).toString('hex') });
    await limitApp.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    await limitApp.register(userRoutes, { prefix: '/api/users' });
    await limitApp.register(authRoutes, { prefix: '/api/auth' });
    await limitApp.ready();
    const limitedRegisters = [];
    for (let index = 0; index < 11; index++) limitedRegisters.push(await limitApp.inject({
      method: 'POST', url: '/api/users/register', remoteAddress: '203.0.113.31', payload: { email: verified.email },
    }));
    assert.equal(limitedRegisters.filter(response => response.statusCode === 429).length, 1);
    const limitedResends = [];
    for (let index = 0; index < 4; index++) limitedResends.push(await limitApp.inject({
      method: 'POST', url: '/api/auth/verify-email/send', remoteAddress: '203.0.113.32', payload: { email: verified.email },
    }));
    assert.equal(limitedResends.filter(response => response.statusCode === 429).length, 1);
    const limitedLogins = [];
    for (let index = 0; index < 6; index++) limitedLogins.push(await limitApp.inject({
      method: 'POST', url: '/api/auth/login', remoteAddress: '203.0.113.33', payload: { email: verified.email, password: 'wrong' },
    }));
    assert.equal(limitedLogins.filter(response => response.statusCode === 429).length, 1);
  } finally { await limitApp.close(); }

  console.log('PASS AUD-05: respostas públicas uniformes; credencial só após prova; desafio por e-mail; reenvio e login seguros.');
} finally {
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
