/** AUD-08: real transport is mocked; all database writes use a disposable schema. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mock } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from './postgresql-test-db.js';
import { hashAuthCode } from '../security/auth-code.js';
import { resolveTransactionalEmailConfig, sendTransactionalEmail } from '../services/transactional-email.provider.js';

const fakeKey = 'xkeysib-aud08-synthetic-test-key';
const sender = 'Kindra <no-reply@mail.kindrafit.com>';
const appUrl = 'https://kindra.example.test';
const configured = { NODE_ENV: 'production', BREVO_API_KEY: fakeKey, EMAIL_FROM: sender, APP_URL: appUrl };
assert.deepEqual(resolveTransactionalEmailConfig(configured), {
  apiKey: fakeKey, sender: { name: 'Kindra', email: 'no-reply@mail.kindrafit.com' }, appUrl,
});
for (const invalid of [
  { ...configured, BREVO_API_KEY: '' },
  { ...configured, BREVO_API_KEY: 'placeholder-value' },
]) assert.throws(() => resolveTransactionalEmailConfig(invalid), /BREVO_API_KEY_INVALID/);
for (const invalid of ['', 'Kindra', 'Kindra <broken>', 'Kindra <no-reply@mail.kindrafit.com>\r\nBcc: x@y.test']) {
  assert.throws(() => resolveTransactionalEmailConfig({ ...configured, EMAIL_FROM: invalid }), /EMAIL_FROM_INVALID/);
}
assert.throws(() => resolveTransactionalEmailConfig({ ...configured, APP_URL: '' }), /APP_URL_INVALID/);
assert.equal(resolveTransactionalEmailConfig({ NODE_ENV: 'test' }), null);

for (const [overrides, expected] of [
  [{ BREVO_API_KEY: '' }, /BREVO_API_KEY_INVALID/],
  [{ EMAIL_FROM: '' }, /EMAIL_FROM_INVALID/],
] as const) {
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
    env: {
      ...process.env, DOTENV_CONFIG_PATH: '/dev/null', ...configured, ...overrides,
      GOOGLE_CLIENT_ID: 'kindra-aud08.apps.googleusercontent.com',
      JWT_SECRET: randomBytes(32).toString('base64'),
      AUTH_CODE_HMAC_SECRET: randomBytes(32).toString('base64'),
    },
    encoding: 'utf8', timeout: 15_000,
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, expected);
  assert.doesNotMatch(child.stdout, /Servidor rodando/);
  assert.doesNotMatch(child.stderr, /xkeysib-aud08-synthetic-test-key/);
}

process.env.NODE_ENV = 'test';
const database = await createTestDatabase();
const { deliverVerificationEmail, sendPasswordResetEmail } = await import('../services/email.service.js');
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

let mode: 'success' | 'http_error' | 'network_error' = 'success';
const requests: Array<{ url: string; init: RequestInit }> = [];
const transport = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init: init ?? {} });
  if (mode === 'network_error') throw new Error(`synthetic transport failed ${fakeKey}`);
  return new Response(mode === 'http_error' ? `synthetic provider error ${fakeKey}` : '',
    { status: mode === 'http_error' ? 503 : 201 });
});
const previousLog = console.log;
const previousError = console.error;
const capturedLogs: string[] = [];
console.log = (...parts: unknown[]) => { capturedLogs.push(parts.map(String).join(' ')); };
console.error = (...parts: unknown[]) => { capturedLogs.push(parts.map(String).join(' ')); };

try {
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_MOCK_DEBUG = '0';
  const countBeforeMock = requests.length;
  await deliverVerificationEmail('aud08-dev@example.test', '123456', 'test-pending-token');
  assert.equal(requests.length, countBeforeMock);
  assert.doesNotMatch(capturedLogs.join(' '), /123456|test-pending-token/);

  process.env.NODE_ENV = 'production';
  process.env.BREVO_API_KEY = fakeKey;
  process.env.EMAIL_FROM = sender;
  process.env.APP_URL = appUrl;
  capturedLogs.length = 0;
  await deliverVerificationEmail('aud08-verify@example.test', '234567', 'test-pending-token');
  const verifyRequest = requests.at(-1)!;
  assert.equal(verifyRequest.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(verifyRequest.init.method, 'POST');
  assert.equal((verifyRequest.init.headers as Record<string, string>)['api-key'], fakeKey);
  assert.ok(verifyRequest.init.signal instanceof AbortSignal);
  const verifyBody = JSON.parse(String(verifyRequest.init.body));
  assert.deepEqual(verifyBody.sender, { name: 'Kindra', email: 'no-reply@mail.kindrafit.com' });
  assert.deepEqual(verifyBody.to, [{ email: 'aud08-verify@example.test' }]);
  assert.match(verifyBody.htmlContent, /234567|Continuar cadastro|20 minutos|kindra/i);
  assert.match(verifyBody.textContent, /234567|20 minutos|kindra/i);
  assert.match(verifyBody.htmlContent, /https:\/\/kindra\.example\.test\/verificar-email#token=test-pending-token/);
  assert.doesNotMatch(String(verifyRequest.init.body), /xkeysib-aud08-synthetic-test-key/);
  assert.doesNotMatch(capturedLogs.join(' '), /234567|test-pending-token|xkeysib-aud08-synthetic-test-key/);

  const resetUser = await prisma.user.create({ data: {
    email: 'aud08-reset@example.test', password: await bcrypt.hash('Valid-password-123!', 10), emailVerified: true,
  } });
  await sendPasswordResetEmail(resetUser.id, resetUser.email);
  const resetBody = JSON.parse(String(requests.at(-1)!.init.body));
  const resetCode = resetBody.textContent.match(/Código: (\d{6})/)?.[1];
  assert.ok(resetCode);
  assert.equal((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: resetUser.id } })).token,
    hashAuthCode('password-reset', resetCode));
  assert.match(resetBody.htmlContent, /10 minutos|Recuperar senha/);
  assert.match(resetBody.textContent, /https:\/\/kindra\.example\.test\/forgot-password/);
  assert.doesNotMatch(capturedLogs.join(' '), new RegExp(`${resetCode}|${fakeKey}`));

  mode = 'http_error';
  await assert.rejects(sendTransactionalEmail({ to: resetUser.email, subject: 'test', html: '<p>test</p>', text: 'test' }),
    error => error instanceof Error && error.message === 'EMAIL_PROVIDER_FAILED');
  mode = 'network_error';
  await assert.rejects(sendTransactionalEmail({ to: resetUser.email, subject: 'test', html: '<p>test</p>', text: 'test' }),
    error => error instanceof Error && error.message === 'EMAIL_PROVIDER_FAILED');

  let address = 1;
  const nextAddress = () => `198.51.100.${address++}`;
  const register = (email: string) => app.inject({ method: 'POST', url: '/api/users/register',
    remoteAddress: nextAddress(), payload: { email } });
  const resend = (email: string) => app.inject({ method: 'POST', url: '/api/auth/verify-email/send',
    remoteAddress: nextAddress(), payload: { email } });
  const forgot = (email: string) => app.inject({ method: 'POST', url: '/api/auth/forgot-password',
    remoteAddress: nextAddress(), payload: { email } });

  const newEmail = 'aud08-new@example.test';
  const first = await register(newEmail);
  const duplicate = await register(newEmail);
  assert.equal(first.statusCode, 202);
  assert.equal(duplicate.statusCode, first.statusCode);
  assert.equal(duplicate.body, first.body);
  assert.equal(duplicate.headers['set-cookie'], undefined);
  const pending = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
  assert.ok(pending.lastEmailDeliveryFailedAt);
  assert.equal(first.json().pendingToken, undefined);
  await prisma.user.update({ where: { id: pending.id }, data: { lastResendAt: new Date(Date.now() - 60_000) } });
  const resent = await resend(newEmail);
  const missingResend = await resend('aud08-missing@example.test');
  assert.equal(resent.statusCode, 200);
  assert.equal(resent.body, missingResend.body);
  assert.equal(resent.headers['content-type'], missingResend.headers['content-type']);
  assert.equal(resent.headers['set-cookie'], undefined);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: pending.id } })).lastEmailDeliveryFailedAt);

  const resetResponse = await forgot(resetUser.email);
  const missingReset = await forgot('aud08-none@example.test');
  assert.equal(resetResponse.statusCode, 200);
  assert.equal(resetResponse.body, missingReset.body);
  assert.equal(resetResponse.headers['content-type'], missingReset.headers['content-type']);
  assert.equal(resetResponse.headers['set-cookie'], undefined);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: resetUser.id } })).lastEmailDeliveryFailedAt);
  assert.doesNotMatch(capturedLogs.join(' '), /xkeysib-aud08-synthetic-test-key|test-pending-token|234567|123456/);
} finally {
  console.log = previousLog;
  console.error = previousError;
  transport.mock.restore();
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
console.log('PASS AUD-08: provider Brevo mockado, templates, fail-fast e respostas públicas uniformes.');
