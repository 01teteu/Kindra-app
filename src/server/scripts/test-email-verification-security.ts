/** AUD-01: challenge ownership, attempt budget and single use, with temporary PostgreSQL. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { createTestDatabase } from './postgresql-test-db.js';
import { hashAuthCode } from '../security/auth-code.js';

process.env.NODE_ENV = 'test';
const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { userRoutes } = await import('../routes/user.routes.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.ready();

let requestNumber = 1;
const challengeIds = new Map<string, string>();
const emails = new Map<string, string>();
const password = 'Aud01-password-123!';
const pending = (id: string) => app.jwt.sign({ id, scope: 'pending_verification', challengeId: challengeIds.get(id) });
const confirm = (code: string, bearer?: string, extra: object = {}) => app.inject({
  method: 'POST', url: '/api/auth/verify-email/confirm',
  remoteAddress: `127.7.${Math.floor(requestNumber / 250)}.${requestNumber++ % 250 + 1}`,
  headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  payload: { token: code, password, confirmPassword: password, ...extra },
});
const send = (id: string) => app.inject({
  method: 'POST', url: '/api/auth/verify-email/send',
  remoteAddress: `127.8.${Math.floor(requestNumber / 250)}.${requestNumber++ % 250 + 1}`,
  payload: { email: emails.get(id) },
});
async function captureCode(email: string, action: () => Promise<unknown>) {
  const original = console.log;
  let code = '';
  let pendingToken = '';
  console.log = (...args: unknown[]) => {
    const line = args.join(' ');
    if (line.includes(`[MOCK EMAIL] Código de Verificação para ${email}:`)) {
      code = line.match(/: (\d{6})$/)?.[1] ?? '';
    }
    if (line.includes(`[MOCK EMAIL] Link de Verificação para ${email}:`)) pendingToken = line.split('#token=')[1] ?? '';
  };
  let response: unknown;
  try { response = await action(); } finally { console.log = original; }
  assert.match(code, /^\d{6}$/);
  assert.ok(pendingToken);
  const claims = app.jwt.verify<{ id: string; challengeId: string }>(pendingToken);
  challengeIds.set(claims.id, claims.challengeId);
  emails.set(claims.id, email);
  return { code, pendingToken, response };
}
async function fixture(email: string, code: string, options: { legacy?: boolean; expired?: boolean; attempts?: number } = {}) {
  const user = await prisma.user.create({ data: { email } });
  const challenge = await prisma.emailVerificationToken.create({ data: {
    userId: user.id, token: hashAuthCode('email-verification', code),
    issuedToEmail: options.legacy ? null : email, attempts: options.attempts ?? 0,
    expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 60_000)),
  } });
  challengeIds.set(user.id, challenge.id);
  emails.set(user.id, email);
  return user;
}
try {
  const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string; column_default: string | null }>>`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'email_verification_tokens'
      AND column_name IN ('attempts', 'issuedToEmail')`;
  assert.equal(columns.length, 2);
  assert.equal(columns.find(item => item.column_name === 'attempts')?.column_default, '0');
  assert.equal(columns.find(item => item.column_name === 'issuedToEmail')?.is_nullable, 'YES');

  const registered = await captureCode('aud01-a@example.test', () => app.inject({
    method: 'POST', url: '/api/users/register', payload: { email: 'aud01-a@example.test' },
  }));
  const registration = registered.response as Awaited<ReturnType<typeof app.inject>>;
  assert.equal(registration.statusCode, 202);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'aud01-a@example.test' } });
  const ownerPending = registered.pendingToken;
  assert.equal(app.jwt.verify<{ id: string }>(ownerPending).id, owner.id);
  const other = await fixture('aud01-b@example.test', '486213');

  const anonymous = await confirm(registered.code);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.cookies.length, 0);
  const expiredPending = app.jwt.sign({ id: owner.id, scope: 'pending_verification', challengeId: challengeIds.get(owner.id) }, { expiresIn: -1 });
  assert.equal((await confirm(registered.code, expiredPending)).statusCode, 401);
  const session = app.jwt.sign({ id: owner.id, scope: 'session', sessionVersion: 0 });
  assert.equal((await confirm(registered.code, session)).statusCode, 403);
  assert.equal((await confirm(registered.code, app.jwt.sign({ id: owner.id, scope: 'reset_password' }))).statusCode, 403);
  assert.equal((await confirm('486213', ownerPending, { userId: other.id, email: other.email })).statusCode, 400);
  assert.equal((await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } })).attempts, 1);
  assert.equal((await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: other.id } })).attempts, 0);
  for (let attempt = 2; attempt <= 5; attempt++) {
    const response = await confirm('XXXXXX', ownerPending);
    assert.equal(response.statusCode, attempt === 5 ? 429 : 400);
    assert.equal(response.cookies.length, 0);
    if (attempt < 5) assert.equal((await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } })).attempts, attempt);
  }
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: owner.id } }), 0);
  assert.equal((await confirm(registered.code, ownerPending)).statusCode, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, false);

  // The existing resend cooldown still applies; a permitted resend replaces the
  // spent challenge and resets only the new challenge's attempt counter.
  await prisma.user.update({ where: { id: owner.id }, data: { lastResendAt: new Date(Date.now() - 60_000) } });
  const resent = await captureCode(owner.email, () => send(owner.id));
  assert.equal((resent.response as Awaited<ReturnType<typeof app.inject>>).statusCode, 200);
  const replacement = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: owner.id } });
  assert.equal(replacement.attempts, 0);
  assert.equal(replacement.issuedToEmail, owner.email);
  assert.notEqual(replacement.token, hashAuthCode('email-verification', registered.code));
  assert.equal((await confirm(registered.code, ownerPending)).statusCode, 400);
  const success = await confirm(resent.code, resent.pendingToken);
  assert.equal(success.statusCode, 200);
  assert.equal(success.cookies.filter(item => item.name === 'token').length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, true);
  assert.equal((await confirm(resent.code, ownerPending)).statusCode, 400);
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: owner.id } }), 0);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: owner.email, password: 'Aud01-password-123!' } });
  assert.equal(login.statusCode, 200);
  assert.equal(login.cookies.some(item => item.name === 'token'), true);

  const concurrent = await fixture('aud01-concurrent@example.test', '759413');
  const simultaneous = await Promise.all(Array.from({ length: 8 }, () => confirm('759413', pending(concurrent.id))));
  assert.equal(simultaneous.filter(response => response.statusCode === 200).length, 1);
  assert.equal(simultaneous.filter(response => response.cookies.some(item => item.name === 'token')).length, 1);
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: concurrent.id } }), 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: concurrent.id } })).emailVerified, true);

  const expired = await fixture('aud01-expired@example.test', '917362', { expired: true });
  assert.equal((await confirm('917362', pending(expired.id))).statusCode, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: expired.id } })).emailVerified, false);

  const legacy = await fixture('aud01-legacy@example.test', '983174', { legacy: true });
  const legacyResponse = await confirm('983174', pending(legacy.id));
  assert.equal(legacyResponse.statusCode, 400);
  assert.match(legacyResponse.json().error, /Solicite um novo código/);
  const reissued = await captureCode(legacy.email, () => send(legacy.id));
  assert.equal((reissued.response as Awaited<ReturnType<typeof app.inject>>).statusCode, 200);
  assert.equal((await confirm(reissued.code, reissued.pendingToken)).statusCode, 200);

  const change = await fixture('aud01-old@example.test', '681532');
  const changedEmail = 'aud01-new@example.test';
  const changed = await captureCode(changedEmail, () => app.inject({
    method: 'POST', url: '/api/auth/verify-email/change', headers: { authorization: `Bearer ${pending(change.id)}` },
    payload: { newEmail: changedEmail },
  }));
  assert.equal((changed.response as Awaited<ReturnType<typeof app.inject>>).statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: change.id } })).emailVerified, false);
  assert.equal((await confirm('681532', pending(change.id))).statusCode, 400);
  assert.equal((await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: change.id } })).issuedToEmail, changedEmail);
  assert.equal((await confirm(changed.code, changed.pendingToken)).statusCode, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: change.id } })).email, changedEmail);

  // The old code cannot verify a new destination even if change and confirmation race.
  const racing = await fixture('aud01-race@example.test', '625974');
  const racePending = pending(racing.id);
  const raceLog = console.log;
  console.log = () => {};
  let pair: Awaited<ReturnType<typeof app.inject>>[];
  try {
    pair = await Promise.all([
      confirm('625974', racePending),
      app.inject({ method: 'POST', url: '/api/auth/verify-email/change',
        headers: { authorization: `Bearer ${racePending}` }, payload: { newEmail: 'aud01-race-new@example.test' } }),
    ]);
  } finally { console.log = raceLog; }
  const raceUser = await prisma.user.findUniqueOrThrow({ where: { id: racing.id } });
  assert.equal(raceUser.emailVerified && raceUser.email === 'aud01-race-new@example.test', false);
  assert.equal(pair.filter(response => response.cookies.some(item => item.name === 'token')).length, raceUser.emailVerified ? 1 : 0);

  // Concurrent resend cannot bypass the original per-account four-issuance cap.
  const limited = await fixture('aud01-limit@example.test', '743526');
  await prisma.user.update({ where: { id: limited.id }, data: { resendAttempts: 3, lastResendAt: new Date(Date.now() - 240_000) } });
  const priorLog = console.log;
  console.log = () => {};
  let resends: Awaited<ReturnType<typeof app.inject>>[];
  try { resends = await Promise.all([send(limited.id), send(limited.id), send(limited.id)]); }
  finally { console.log = priorLog; }
  assert.equal(resends.filter(response => response.statusCode === 200).length, 3);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: limited.id } })).resendAttempts, 4);
  challengeIds.set(limited.id, (await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: limited.id } })).id);
  const overLimitChange = await app.inject({ method: 'POST', url: '/api/auth/verify-email/change',
    headers: { authorization: `Bearer ${pending(limited.id)}` }, payload: { newEmail: 'aud01-limit-new@example.test' } });
  assert.equal(overLimitChange.statusCode, 429);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: limited.id } })).email, limited.email);

  console.log('PASS AUD-01: JWT/account binding, attempts, single use, migration, resend, email change and concurrency.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
