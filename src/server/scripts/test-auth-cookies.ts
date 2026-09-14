import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { createTestDatabase } from './postgresql-test-db.js';

const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { requireScope } = await import('../middlewares/auth.js');
const previousEnvironment = process.env.NODE_ENV;
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
await app.register(authRoutes, { prefix: '/api/auth' });
app.get('/protected', { preHandler: requireScope() }, async request => request.user);
const password = 'Cookie-test-123!';

try {
  for (const environment of ['development', 'production']) {
    process.env.NODE_ENV = environment;
    const email = `${environment}@example.test`;
    const user = await prisma.user.create({ data: { email, password: await bcrypt.hash(password, 10) } });
    const code = randomUUID();
    await prisma.emailVerificationToken.create({ data: {
      userId: user.id, token: createHash('sha256').update(code).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    } });

    const failedLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'wrong' } });
    assert.equal(failedLogin.statusCode, 401);
    assert.equal(failedLogin.cookies.length, 0);

    // Only the external Google identity provider is mocked; routes, JWT and DB are real.
    const google = mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => new LoginTicket('', {
      iss: 'https://accounts.google.com', sub: user.id, aud: 'test', iat: 1, exp: 9999999999,
      email, email_verified: true,
    }));
    try {
      for (const [route, payload] of [
        ['/verify-email/confirm', { token: code }],
        ['/login', { email, password }],
        ['/google', { credential: 'test-provider-token' }],
      ] as const) {
        for (const host of ['localhost:3000', '192.168.0.8:3000']) {
          // A verification token is single-use, so only confirm it once.
          if (route === '/verify-email/confirm' && host.startsWith('localhost')) continue;
          const response = await app.inject({ method: 'POST', url: `/api/auth${route}`, headers: { host }, payload });
          assert.equal(response.statusCode, 200, response.body);
          const session = response.cookies.find(item => item.name === 'token');
          assert.ok(session);
          assert.equal(!!session.secure, environment === 'production');
          assert.equal(session.httpOnly, true);
          assert.equal(session.sameSite, 'Lax');
          assert.equal(session.path, '/');
          assert.equal(session.domain, undefined);
          assert.equal(session.maxAge, 86400);
          const claims = app.jwt.verify<{ id: string; scope: string; iat: number; exp: number }>(session.value);
          assert.equal(claims.id, user.id);
          assert.equal(claims.scope, 'session');
          assert.equal(claims.exp - claims.iat, 86400);
          assert.equal((await app.inject({ url: '/protected', cookies: { token: session.value } })).statusCode, 200);

          const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { token: session.value } });
          assert.equal(logout.statusCode, 200);
          const cleared = logout.cookies.find(item => item.name === 'token');
          assert.ok(cleared);
          for (const flag of ['path', 'domain', 'httpOnly', 'secure', 'sameSite'] as const) {
            assert.equal(cleared[flag], session[flag]);
          }
          assert.equal(cleared.value, '');
          assert.ok(new Date(cleared.expires!).getTime() < Date.now());
          assert.equal((await app.inject({ url: '/protected', cookies: { token: cleared.value } })).statusCode, 401);
        }
      }
    } finally { google.mock.restore(); }
    const reused = await app.inject({ method: 'POST', url: '/api/auth/verify-email/confirm', payload: { token: code } });
    assert.equal(reused.statusCode, 400);
    assert.equal(reused.cookies.length, 0);
    console.log(`PASS ${environment}: login, verify-email, Google, cookie flags, JWT and logout.`);
  }
  for (const scope of ['pending_verification', 'reset_password']) {
    const token = app.jwt.sign({ id: randomUUID(), scope });
    assert.equal((await app.inject({ url: '/protected', cookies: { token } })).statusCode, 403);
  }
  console.log('PASS temporary tokens cannot authenticate a session.');
} finally {
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
