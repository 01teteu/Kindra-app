/** AUD-06: Google ID tokens must have an explicit, validated audience. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mock } from 'node:test';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { resolveGoogleClientId } from '../security/google-client-id.js';
import { createTestDatabase } from './postgresql-test-db.js';

const kindraClientId = 'kindra-aud06.apps.googleusercontent.com';
const otherClientId = 'other-aud06.apps.googleusercontent.com';
assert.equal(resolveGoogleClientId({ NODE_ENV: 'production', GOOGLE_CLIENT_ID: `  ${kindraClientId}  ` }), kindraClientId);
for (const invalid of [undefined, '', '  ', 'seu-client-id-aqui.apps.googleusercontent.com',
  `${kindraClientId},${otherClientId}`, 'GOCSPX-client-secret', 'not-a-client-id',
  `has space.apps.googleusercontent.com`]) {
  assert.throws(() => resolveGoogleClientId({ NODE_ENV: 'production', GOOGLE_CLIENT_ID: invalid }), /GOOGLE_CLIENT_ID/);
  assert.equal(resolveGoogleClientId({ NODE_ENV: 'development', GOOGLE_CLIENT_ID: invalid }), null);
  assert.equal(resolveGoogleClientId({ NODE_ENV: 'test', GOOGLE_CLIENT_ID: invalid }), null);
}

// Preload the local env-reading modules, then remove the setting before server.ts
// runs. This tests true absence without editing the developer's .env.
const routesUrl = pathToFileURL(path.resolve('src/server/routes/auth.routes.ts')).href;
const serverUrl = pathToFileURL(path.resolve('src/server/server.ts')).href;
const missingStartup = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  `await import('dotenv/config'); await import(${JSON.stringify(routesUrl)});` +
  `delete process.env.GOOGLE_CLIENT_ID; await import(${JSON.stringify(serverUrl)});`,
], {
  env: { ...process.env, NODE_ENV: 'production',
    JWT_SECRET: randomBytes(32).toString('base64'),
    AUTH_CODE_HMAC_SECRET: randomBytes(32).toString('base64') },
  encoding: 'utf8', timeout: 15000,
});
assert.notEqual(missingStartup.status, 0);
assert.match(missingStartup.stderr, /GOOGLE_CLIENT_ID/);
assert.doesNotMatch(missingStartup.stdout, /Servidor rodando/);

// Explicit values prevent Prisma's local .env discovery from filling the variable.
for (const invalid of ['', 'seu-client-id-aqui.apps.googleusercontent.com']) {
  const childEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: '/dev/null',
    GOOGLE_CLIENT_ID: invalid,
    JWT_SECRET: randomBytes(32).toString('base64'),
    AUTH_CODE_HMAC_SECRET: randomBytes(32).toString('base64'),
  };
  const startup = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
    env: childEnvironment, encoding: 'utf8', timeout: 15000,
  });
  assert.notEqual(startup.status, 0);
  assert.match(startup.stderr, /GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(startup.stdout, /Servidor rodando/);
}
const validGoogleStartup = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
  env: {
    ...process.env,
    NODE_ENV: 'production', DOTENV_CONFIG_PATH: '/dev/null',
    GOOGLE_CLIENT_ID: kindraClientId,
    JWT_SECRET: 'invalid-test-value',
    AUTH_CODE_HMAC_SECRET: randomBytes(32).toString('base64'),
    BREVO_API_KEY: 'xkeysib-google-audience-test-only',
    EMAIL_FROM: 'Kindra <no-reply@mail.kindrafit.com>', APP_URL: 'https://kindra.example.test',
  },
  encoding: 'utf8', timeout: 15000,
});
assert.notEqual(validGoogleStartup.status, 0);
assert.doesNotMatch(validGoogleStartup.stderr, /GOOGLE_CLIENT_ID/);
assert.match(validGoogleStartup.stderr, /JWT_SECRET/);

const previousClientId = process.env.GOOGLE_CLIENT_ID;
const previousEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = kindraClientId;
const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.ready();

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicCertificate = publicKey.export({ type: 'spki', format: 'pem' });
const certificates = mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({
  certs: { synthetic: publicCertificate },
}) as any);
const previousConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (args[0] === '[Google Auth Error]' && args[1] instanceof Error &&
      ['INVALID_GOOGLE_TOKEN', 'GOOGLE_OAUTH_NOT_CONFIGURED'].includes(args[1].message)) return;
  previousConsoleError(...args);
};
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function syntheticToken(email: string, audience?: string) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'accounts.google.com', sub: email, email, email_verified: true,
    iat: now - 10, exp: now + 1800, ...(audience === undefined ? {} : { aud: audience }) };
  const signed = `${encode({ alg: 'RS256', kid: 'synthetic' })}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(signed).end().sign(privateKey).toString('base64url');
  return `${signed}.${signature}`;
}
let requestNumber = 1;
const googleLogin = (credential: string) => app.inject({ method: 'POST', url: '/api/auth/google',
  remoteAddress: `198.51.100.${requestNumber++}`, payload: { credential } });

try {
  const correctEmail = 'aud06-correct@example.test';
  const correct = await googleLogin(syntheticToken(correctEmail, kindraClientId));
  assert.equal(correct.statusCode, 200, correct.body);
  assert.ok(correct.cookies.some(item => item.name === 'token'));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { email: correctEmail } })).emailVerified, true);

  for (const [email, audience] of [
    ['aud06-wrong@example.test', otherClientId],
    ['aud06-no-aud@example.test', undefined],
  ] as const) {
    const rejected = await googleLogin(syntheticToken(email, audience));
    assert.equal(rejected.statusCode, 401);
    assert.equal(rejected.cookies.length, 0);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  }

  // A valid ID from another application authorizes only that application's audience.
  process.env.GOOGLE_CLIENT_ID = otherClientId;
  assert.equal((await googleLogin(syntheticToken('aud06-old-client@example.test', kindraClientId))).statusCode, 401);
  assert.equal((await googleLogin(syntheticToken('aud06-other-client@example.test', otherClientId))).statusCode, 200);

  const verifySpy = mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
    throw new Error('AUD06_VERIFY_SHOULD_NOT_RUN');
  });
  try {
    for (const invalid of [undefined, '', 'seu-client-id-aqui.apps.googleusercontent.com',
      `${kindraClientId},${otherClientId}`, 'GOCSPX-client-secret']) {
      if (invalid === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = invalid;
      const unavailable = await googleLogin(syntheticToken('aud06-unavailable@example.test', kindraClientId));
      assert.equal(unavailable.statusCode, 503);
      assert.equal(unavailable.cookies.length, 0);
    }
    assert.equal(verifySpy.mock.callCount(), 0);
  } finally { verifySpy.mock.restore(); }

  const localEmail = 'aud06-local@example.test';
  const localPassword = 'Local-password-123!';
  await prisma.user.create({ data: { email: localEmail, emailVerified: true,
    password: await bcrypt.hash(localPassword, 10) } });
  const localLogin = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { email: localEmail, password: localPassword } });
  assert.equal(localLogin.statusCode, 200);
  assert.ok(localLogin.cookies.some(item => item.name === 'token'));

  console.log('PASS AUD-06: audience explícita; configuração fail-closed; startup protegido; login Google e local preservados.');
} finally {
  console.error = previousConsoleError;
  certificates.mock.restore();
  if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = previousClientId;
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
