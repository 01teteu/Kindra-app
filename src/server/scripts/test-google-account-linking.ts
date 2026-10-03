/** AUD-07: Google subject ownership and explicit local legacy migration. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mock } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { createTestDatabase } from './postgresql-test-db.js';

const clientId = 'kindra-aud07.apps.googleusercontent.com';
const previousClientId = process.env.GOOGLE_CLIENT_ID;
const previousEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = clientId;
const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { linkLegacyGoogleSub } = await import('./link-legacy-google-sub.js');
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
      args[1].message === 'INVALID_GOOGLE_TOKEN') return;
  previousConsoleError(...args);
};
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function syntheticToken(sub: string, email: string, options: { audience?: string; issuedAt?: number; verified?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'accounts.google.com', sub, email, email_verified: options.verified ?? true,
    aud: options.audience ?? clientId, iat: options.issuedAt ?? now - 1, exp: now + 1800,
  };
  const signed = `${encode({ alg: 'RS256', kid: 'synthetic' })}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(signed).end().sign(privateKey).toString('base64url');
  return `${signed}.${signature}`;
}
let requestNumber = 1;
const googleLogin = (credential: string) => app.inject({
  method: 'POST', url: '/api/auth/google', remoteAddress: `198.51.100.${requestNumber++}`,
  payload: { credential },
});

try {
  // Reapply the exact additive SQL over pre-existing rows inside the disposable schema.
  const beforeMigration = await prisma.user.create({ data: {
    email: 'aud07-before-migration@example.test', provider: 'GOOGLE', emailVerified: true,
  } });
  await prisma.$executeRawUnsafe('DROP INDEX "users_googleSub_key"');
  await prisma.$executeRawUnsafe('ALTER TABLE "users" DROP COLUMN "googleSub"');
  const migrationSql = readFileSync('prisma/migrations/20261001120000_google_sub_account_identity/migration.sql', 'utf8');
  for (const statement of migrationSql.split(';').map(part => part.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
  const migrated = await prisma.user.findUniqueOrThrow({ where: { id: beforeMigration.id } });
  assert.equal(migrated.googleSub, null);
  assert.equal(migrated.email, beforeMigration.email);

  const first = await googleLogin(syntheticToken('aud07-sub-1', 'aud07-new@example.test'));
  assert.equal(first.statusCode, 200);
  assert.ok(first.cookies.some(item => item.name === 'token'));
  const firstUser = await prisma.user.findUniqueOrThrow({ where: { email: 'aud07-new@example.test' } });
  assert.equal(firstUser.googleSub, 'aud07-sub-1');
  assert.equal(firstUser.provider, 'GOOGLE');
  assert.equal(firstUser.password, null);
  assert.equal(firstUser.emailVerified, true);
  const firstCookie = first.cookies.find(item => item.name === 'token')!;
  assert.equal((app.jwt.verify(firstCookie.value) as { sessionVersion: number }).sessionVersion, firstUser.sessionVersion);

  const repeat = await googleLogin(syntheticToken('aud07-sub-1', 'aud07-changed@example.test'));
  assert.equal(repeat.statusCode, 200);
  assert.equal(JSON.parse(repeat.body).user.id, firstUser.id);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: firstUser.id } })).email, firstUser.email);
  assert.equal(await prisma.user.count({ where: { email: 'aud07-changed@example.test' } }), 0);

  const localPassword = 'aud07-local-password-123!';
  const local = await prisma.user.create({ data: {
    email: 'aud07-local@example.test', password: await bcrypt.hash(localPassword, 10),
    emailVerified: true, sessionVersion: 3,
  } });
  const pending = await prisma.user.create({ data: {
    email: 'aud07-pending@example.test', emailVerified: false,
  } });
  const legacy = await prisma.user.create({ data: {
    email: 'aud07-legacy@example.test', provider: 'GOOGLE', emailVerified: true,
  } });

  const invalidAudience = await googleLogin(syntheticToken('aud07-other', 'aud07-other@example.test', {
    audience: 'other-aud07.apps.googleusercontent.com',
  }));
  assert.equal(invalidAudience.statusCode, 401);
  for (const [sub, email, userId] of [
    ['aud07-sub-2', firstUser.email, firstUser.id],
    ['aud07-local-sub', local.email, local.id],
    ['aud07-pending-sub', pending.email, pending.id],
    ['aud07-legacy-sub', legacy.email, legacy.id],
  ]) {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const denied = await googleLogin(syntheticToken(sub, email));
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.body, invalidAudience.body);
    assert.equal(denied.headers['content-type'], invalidAudience.headers['content-type']);
    assert.equal(denied.cookies.length, 0);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.deepEqual(after, before);
    assert.equal(await prisma.user.count({ where: { googleSub: sub } }), 0);
  }

  const localLogin = await app.inject({ method: 'POST', url: '/api/auth/login',
    payload: { email: local.email, password: localPassword } });
  assert.equal(localLogin.statusCode, 200);
  const localCookie = localLogin.cookies.find(item => item.name === 'token')!;
  assert.equal((app.jwt.verify(localCookie.value) as { sessionVersion: number }).sessionVersion, 3);

  const legacyCredential = syntheticToken('aud07-legacy-sub', legacy.email);
  assert.equal(await linkLegacyGoogleSub(legacy.id, legacyCredential), 'dry_run');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).googleSub, null);
  await assert.rejects(linkLegacyGoogleSub(legacy.id, 'invalid-token'), /INVALID_GOOGLE_TOKEN/);
  await assert.rejects(linkLegacyGoogleSub(legacy.id, syntheticToken('aud07-legacy-sub', legacy.email, {
    audience: 'wrong-aud07.apps.googleusercontent.com',
  })), /INVALID_GOOGLE_TOKEN/);
  await assert.rejects(linkLegacyGoogleSub(legacy.id, syntheticToken('aud07-legacy-sub', legacy.email, {
    issuedAt: Math.floor(Date.now() / 1000) - 360,
  })), /INVALID_GOOGLE_TOKEN/);
  await assert.rejects(linkLegacyGoogleSub(legacy.id, syntheticToken(firstUser.googleSub!, legacy.email)),
    /LEGACY_LINK_REJECTED/);
  await assert.rejects(linkLegacyGoogleSub(local.id, legacyCredential), /LEGACY_LINK_REJECTED/);
  const savedUrl = process.env.DATABASE_URL;
  try {
    // A non-local host is rejected before any database query.
    process.env.DATABASE_URL = 'postgresql://not-local.example.test:5432/remote';
    await assert.rejects(linkLegacyGoogleSub(legacy.id, legacyCredential), /LOCAL_DATABASE_REQUIRED/);
  } finally { process.env.DATABASE_URL = savedUrl; }
  assert.equal(await linkLegacyGoogleSub(legacy.id, legacyCredential, true), 'linked');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).googleSub, 'aud07-legacy-sub');
  await assert.rejects(linkLegacyGoogleSub(legacy.id, legacyCredential, true), /LEGACY_LINK_REJECTED/);
  const linkedLogin = await googleLogin(legacyCredential);
  assert.equal(linkedLogin.statusCode, 200);
  assert.equal(JSON.parse(linkedLogin.body).user.id, legacy.id);

  console.log('PASS AUD-07: identidade por sub, colisões fechadas, legado explícito e migration aditiva.');
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
