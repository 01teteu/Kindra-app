/** SEC-04 regression: password-reset attempts and consumption are serialized per token. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
const { authRoutes } = await import('../routes/auth.routes.js');
const { verifyResetCodeService } = await import('../services/auth.service.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.ready();

const password = 'Reset-owner-123!';
const email = 'reset-concurrency@example.test';
const user = await prisma.user.create({
  data: { email, password: await bcrypt.hash(password, 10), emailVerified: true },
});

async function issue(code: string, options: { attempts?: number; used?: boolean; expired?: boolean } = {}) {
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  return prisma.passwordResetToken.create({ data: {
    userId: user.id,
    token: hashAuthCode('password-reset', code),
    attempts: options.attempts ?? 0,
    used: options.used ?? false,
    expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 60_000)),
  } });
}

async function rejectedMessage(promise: Promise<unknown>) {
  try {
    await promise;
    assert.fail('A validação deveria ter sido rejeitada.');
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
}

try {
  const sequential = await issue('111111');
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '999999' })), 'INVALID_TOKEN');
    assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: sequential.id } })).attempts, attempt);
  }
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '111111' })), 'MAX_VALIDATION_ATTEMPTS');
  assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: sequential.id } })).used, true);

  const concurrent = await issue('222222');
  const simultaneous = await Promise.allSettled(
    Array.from({ length: 20 }, () => verifyResetCodeService({ email, token: '999999' })),
  );
  assert.equal(simultaneous.every(result => result.status === 'rejected'), true);
  assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: concurrent.id } })).attempts, 5);
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '222222' })), 'TOKEN_ALREADY_USED');

  const valid = await issue('333333');
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '999999' })), 'INVALID_TOKEN');
  const verifiedDirectly = await verifyResetCodeService({ email, token: '333333' });
  assert.equal(verifiedDirectly.user.id, user.id);
  assert.equal(verifiedDirectly.challengeId, valid.id);
  assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: valid.id } })).resetGrantId, verifiedDirectly.resetGrantId);
  assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: valid.id } })).used, true);
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '333333' })), 'TOKEN_ALREADY_USED');

  await issue('444444', { expired: true });
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '444444' })), 'TOKEN_EXPIRED');
  await issue('555555', { used: true });
  assert.equal(await rejectedMessage(verifyResetCodeService({ email, token: '555555' })), 'TOKEN_ALREADY_USED');

  await issue('666666');
  const correctRace = await Promise.all(Array.from({ length: 8 }, (_, index) => app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', remoteAddress: `127.0.0.${index + 2}`,
    payload: { email, token: '666666' },
  })));
  assert.equal(correctRace.filter(response => response.statusCode === 200).length, 1);
  assert.equal(correctRace.filter(response => typeof response.json().resetToken === 'string').length, 1);
  assert.equal(correctRace.filter(response => response.statusCode === 400).length, 7);

  let requestNumber = 1;
  const nextIp = () => `127.20.${Math.floor(requestNumber / 250)}.${requestNumber++ % 250 + 1}`;
  const verify = (code: string) => app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', remoteAddress: nextIp(), payload: { email, token: code },
  });
  const resetWith = (token: string, newPassword: string) => app.inject({
    method: 'POST', url: '/api/auth/reset-password', remoteAddress: nextIp(),
    headers: { authorization: `Bearer ${token}` },
    payload: { password: newPassword, confirmPassword: newPassword },
  });

  const legitimateCode = '777777';
  await issue(legitimateCode);
  const verification = await verify(legitimateCode);
  assert.equal(verification.statusCode, 200);
  const resetToken = verification.json().resetToken;
  assert.equal(typeof resetToken, 'string');
  const claims = app.jwt.verify<{ id: string; scope: string; challengeId: string; resetGrantId: string }>(resetToken);
  assert.equal(claims.id, user.id);
  assert.equal(claims.scope, 'reset_password');
  assert.equal(claims.challengeId, (await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })).id);
  assert.equal(typeof claims.resetGrantId, 'string');
  const { iat: _iat, exp: _exp, ...resetClaims } = claims as typeof claims & { iat?: number; exp?: number };

  const other = await prisma.user.create({ data: { email: 'reset-other@example.test', emailVerified: true } });
  for (const invalid of [
    app.jwt.sign(resetClaims, { expiresIn: -1 }),
    app.jwt.sign({ ...resetClaims, scope: 'session' }),
    app.jwt.sign({ id: user.id, scope: 'reset_password' }),
    app.jwt.sign({ ...resetClaims, resetGrantId: randomUUID() }),
    app.jwt.sign({ ...resetClaims, challengeId: randomUUID() }),
    app.jwt.sign({ ...resetClaims, id: other.id }),
  ]) {
    const response = await resetWith(invalid, 'Reset-invalid-456!');
    assert.ok([401, 403].includes(response.statusCode));
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 0);
  assert.ok(await bcrypt.compare(password, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!));

  const newPassword = 'Reset-owner-456!';
  const reset = await resetWith(resetToken, newPassword);
  assert.equal(reset.statusCode, 200);
  assert.ok(await bcrypt.compare(newPassword, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);
  assert.equal((await resetWith(resetToken, 'Reset-replay-456!')).statusCode, 401);
  assert.ok(await bcrypt.compare(newPassword, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 1);

  await issue('888888');
  const concurrentToken = (await verify('888888')).json().resetToken as string;
  const concurrentResets = await Promise.all([
    resetWith(concurrentToken, 'Reset-race-a-456!'), resetWith(concurrentToken, 'Reset-race-b-456!'),
  ]);
  assert.deepEqual(concurrentResets.map(response => response.statusCode).sort(), [200, 401]);
  const winner = concurrentResets[0].statusCode === 200 ? 'Reset-race-a-456!' : 'Reset-race-b-456!';
  assert.ok(await bcrypt.compare(winner, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 2);

  await issue('999999');
  const rollbackToken = (await verify('999999')).json().resetToken as string;
  const rollbackChallenge = app.jwt.verify<{ challengeId: string; resetGrantId: string }>(rollbackToken);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_reset_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.password IS DISTINCT FROM OLD.password THEN RAISE EXCEPTION 'injected reset failure'; END IF;
    RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_reset_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_reset_update()');
  const originalError = console.error;
  console.error = () => {};
  let failedReset;
  try { failedReset = await resetWith(rollbackToken, 'Reset-failed-456!'); }
  finally { console.error = originalError; }
  assert.equal(failedReset.statusCode, 500);
  assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: rollbackChallenge.challengeId } })).resetGrantId, rollbackChallenge.resetGrantId);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 2);
  assert.ok(await bcrypt.compare(winner, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!));
  await prisma.$executeRawUnsafe('DROP TRIGGER fail_reset_update ON users');
  await prisma.$executeRawUnsafe('DROP FUNCTION fail_reset_update()');
  assert.equal((await resetWith(rollbackToken, 'Reset-recovered-456!')).statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 3);

  // A new public request replaces the old challenge and its grant.
  await issue('101010');
  const oldGrantToken = (await verify('101010')).json().resetToken as string;
  async function requestNewCode() {
    const originalLog = console.log;
    let code = '';
    console.log = (...args: unknown[]) => {
      const line = args.join(' ');
      if (line.includes('[MOCK EMAIL] Código de Redefinição')) code = line.match(/: (\d{6})$/)?.[1] ?? '';
    };
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/auth/forgot-password', remoteAddress: nextIp(), payload: { email },
      });
      assert.equal(response.statusCode, 200);
    } finally { console.log = originalLog; }
    assert.match(code, /^\d{6}$/);
    return code;
  }
  const firstNewCode = await requestNewCode();
  assert.equal((await resetWith(oldGrantToken, 'Reset-old-grant-456!')).statusCode, 401);
  const firstNewGrant = (await verify(firstNewCode)).json().resetToken as string;
  await prisma.user.update({ where: { id: user.id }, data: { resetResendAttempts: 0, lastResetResendAt: null } });
  const secondNewCode = await requestNewCode();
  assert.equal((await resetWith(firstNewGrant, 'Reset-superseded-456!')).statusCode, 401);
  assert.equal((await verify(firstNewCode)).statusCode, 400);
  const finalGrant = (await verify(secondNewCode)).json().resetToken as string;
  assert.equal((await resetWith(finalGrant, 'Reset-latest-456!')).statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 4);

  console.log('PASS SEC-04/AUD-03: código e grant de reset são consumidos uma vez; concorrência, rollback, expiração e substituição preservados.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
