/** SEC-09: password-reset requests must not disclose account existence or provider. */
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
const { authRoutes } = await import('../routes/auth.routes.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.ready();

const genericBody = {
  message: 'Se o e-mail existir e estiver verificado, você receberá um código de redefinição.',
};
const password = 'Enumeration-owner-123!';
const accounts = {
  eligible: 'recovery-eligible@example.test',
  unverified: 'recovery-unverified@example.test',
  google: 'recovery-google@example.test',
  cooldown: 'recovery-cooldown@example.test',
  maximum: 'recovery-maximum@example.test',
  missing: 'recovery-missing@example.test',
};

try {
  const passwordHash = await bcrypt.hash(password, 10);
  const eligible = await prisma.user.create({ data: { email: accounts.eligible, password: passwordHash, emailVerified: true, provider: 'LOCAL' } });
  const unverified = await prisma.user.create({ data: { email: accounts.unverified, password: passwordHash, emailVerified: false, provider: 'LOCAL' } });
  const google = await prisma.user.create({ data: { email: accounts.google, password: null, emailVerified: true, provider: 'GOOGLE' } });
  const cooldown = await prisma.user.create({ data: {
    email: accounts.cooldown, password: passwordHash, emailVerified: true, provider: 'LOCAL',
    resetResendAttempts: 1, lastResetResendAt: new Date(),
  } });
  const maximum = await prisma.user.create({ data: {
    email: accounts.maximum, password: passwordHash, emailVerified: true, provider: 'LOCAL',
    resetResendAttempts: 4, lastResetResendAt: new Date(),
  } });

  let eligibleCode = '';
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (line.includes(`[MOCK EMAIL] Código de Redefinição para ${accounts.eligible}:`)) {
      eligibleCode = line.match(/: (\d{6})$/)?.[1] ?? '';
    }
  };
  let responses: Awaited<ReturnType<typeof app.inject>>[];
  try {
    responses = [];
    for (const [index, email] of Object.values(accounts).entries()) {
      responses.push(await app.inject({
        method: 'POST', url: '/api/auth/forgot-password', remoteAddress: `127.10.0.${index + 1}`, payload: { email },
      }));
    }
  } finally {
    console.log = originalLog;
  }

  for (const response of responses) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), genericBody);
    assert.match(response.headers['content-type'] ?? '', /^application\/json/);
    assert.equal(response.headers['content-length'], responses[0].headers['content-length']);
    assert.equal(response.headers['x-ratelimit-limit'], responses[0].headers['x-ratelimit-limit']);
    assert.equal(response.headers['x-ratelimit-remaining'], responses[0].headers['x-ratelimit-remaining']);
    assert.equal(response.headers['retry-after'], undefined);
  }
  assert.match(eligibleCode, /^\d{6}$/);
  const eligibleToken = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: eligible.id } });
  assert.equal(eligibleToken.token, hashAuthCode('password-reset', eligibleCode));
  for (const user of [unverified, google, cooldown, maximum]) {
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 0);
  }
  assert.equal(await prisma.user.count({ where: { email: accounts.missing } }), 0);
  const cooldownAfter = await prisma.user.findUniqueOrThrow({ where: { id: cooldown.id } });
  assert.equal(cooldownAfter.resetResendAttempts, 1);
  assert.equal(cooldownAfter.lastResetResendAt?.getTime(), cooldown.lastResetResendAt?.getTime());
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: maximum.id } })).resetResendAttempts, 4);

  const verification = await app.inject({
    method: 'POST', url: '/api/auth/verify-reset-code', remoteAddress: '127.11.0.1',
    payload: { email: accounts.eligible, token: eligibleCode },
  });
  assert.equal(verification.statusCode, 200);
  const resetToken = verification.json().resetToken;
  assert.equal(typeof resetToken, 'string');
  const newPassword = 'Enumeration-owner-456!';
  const reset = await app.inject({
    method: 'POST', url: '/api/auth/reset-password', remoteAddress: '127.11.0.2',
    headers: { authorization: `Bearer ${resetToken}` },
    payload: { password: newPassword, confirmPassword: newPassword },
  });
  assert.equal(reset.statusCode, 200);
  assert.ok(await bcrypt.compare(newPassword, (await prisma.user.findUniqueOrThrow({ where: { id: eligible.id } })).password!));

  const invalid = await app.inject({
    method: 'POST', url: '/api/auth/forgot-password', remoteAddress: '127.12.0.1', payload: { email: 'invalid' },
  });
  assert.equal(invalid.statusCode, 400);

  const limitedIp = '127.13.0.1';
  for (let request = 0; request < 3; request++) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', remoteAddress: limitedIp, payload: { email: accounts.missing } });
    assert.equal(response.statusCode, 200);
  }
  const limited = await app.inject({ method: 'POST', url: '/api/auth/forgot-password', remoteAddress: limitedIp, payload: { email: accounts.missing } });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);

  console.log('PASS SEC-09: resposta uniforme; códigos restritos à conta elegível; cooldown interno; recuperação legítima e rate limit por IP preservados.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
