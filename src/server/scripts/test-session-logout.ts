/** SEC-RC1-03: individual session logout and durable revocation on disposable PostgreSQL. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mock } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { createTestDatabase } from './postgresql-test-db.js';

const probe = process.argv.includes('--probe');
const database = probe ? null : await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { requireScope } = await import('../middlewares/auth.js');
const secret = process.env.SESSION_LOGOUT_TEST_SECRET ?? randomBytes(32).toString('hex');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret, cookie: { cookieName: 'token', signed: false } });
await app.register(authRoutes, { prefix: '/api/auth' });
app.get('/protected', { preHandler: requireScope('session') }, async () => ({ ok: true }));
await app.ready();

const status = async (token: string) => (await app.inject({ url: '/protected', cookies: { token } })).statusCode;
const cookieFrom = (response: Awaited<ReturnType<typeof app.inject>>) => {
  const value = response.cookies.find(item => item.name === 'token')?.value;
  assert.equal(typeof value, 'string');
  return value!;
};

try {
  if (probe) {
    assert.equal(await status(process.env.SESSION_LOGOUT_REVOKED_TEST_TOKEN!), 401);
    assert.equal(await status(process.env.SESSION_LOGOUT_ACTIVE_TEST_TOKEN!), 200);
    console.log('PASS outro processo reconhece revogação persistida e sessão independente.');
  } else {
    const table = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'revoked_session_tokens'`;
    assert.equal(table.length, 1);
    const password = 'Session-logout-test-123!';
    const owner = await prisma.user.create({ data: {
      email: 'logout-owner@example.test', password: await bcrypt.hash(password, 10), emailVerified: true,
    } });
    const other = await prisma.user.create({ data: {
      email: 'logout-other@example.test', password: await bcrypt.hash(password, 10), emailVerified: true,
    } });
    const login = async (email: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    const loginA = await login(owner.email);
    const loginB = await login(owner.email);
    const otherLogin = await login(other.email);
    assert.equal(loginA.statusCode, 200);
    assert.equal(loginB.statusCode, 200);
    assert.equal(otherLogin.statusCode, 200);
    const tokenA = cookieFrom(loginA);
    const tokenB = cookieFrom(loginB);
    const otherToken = cookieFrom(otherLogin);
    const claimsA = app.jwt.verify<{ jti: string; sessionVersion: number }>(tokenA);
    const claimsB = app.jwt.verify<{ jti: string; sessionVersion: number }>(tokenB);
    assert.match(claimsA.jti, /^[0-9a-f-]{36}$/);
    assert.notEqual(claimsA.jti, claimsB.jti);
    assert.notEqual(tokenA, tokenB);
    assert.equal(await status(tokenA), 200);
    assert.equal(await status(tokenB), 200);

    const loggedOut = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { token: tokenA } });
    assert.equal(loggedOut.statusCode, 200);
    const cleared = loggedOut.cookies.find(item => item.name === 'token');
    assert.ok(cleared);
    assert.equal(cleared.value, '');
    assert.equal(cleared.httpOnly, true);
    assert.equal(cleared.sameSite, 'Lax');
    assert.equal(cleared.path, '/');
    assert.equal(await status(tokenA), 401);
    assert.equal(await status(tokenB), 200);
    assert.equal(await status(otherToken), 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).sessionVersion, 0);
    const revoked = await prisma.revokedSessionToken.findFirstOrThrow({ where: { userId: owner.id } });
    assert.match(revoked.tokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(revoked.tokenHash, tokenA);
    assert.ok(revoked.expiresAt);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { token: tokenA } })).statusCode, 200);
    assert.equal(await prisma.revokedSessionToken.count({ where: { userId: owner.id } }), 1);
    console.log('PASS logout revoga só JWT A; cookie limpo; sessão B e outro usuário permanecem válidos.');

    const loginC = await login(owner.email);
    const tokenC = cookieFrom(loginC);
    const forgedOwner = await app.inject({ method: 'POST', url: '/api/auth/logout',
      cookies: { token: tokenC }, payload: { userId: other.id, tokenHash: '0'.repeat(64) } });
    assert.equal(forgedOwner.statusCode, 200);
    assert.equal(await status(tokenC), 401);
    assert.equal(await status(otherToken), 200);
    assert.equal(await status(tokenB), 200);
    console.log('PASS payload de ownership forjado não revoga sessão alheia.');

    const legacy = app.jwt.sign({ id: owner.id, scope: 'session', sessionVersion: 0 }, { expiresIn: '24h' });
    assert.equal((app.jwt.verify(legacy) as { jti?: string }).jti, undefined);
    assert.equal(await status(legacy), 200);
    const legacyLogout = await app.inject({ method: 'POST', url: '/api/auth/logout',
      headers: { authorization: `Bearer ${legacy}` }, cookies: { token: tokenB } });
    assert.equal(legacyLogout.statusCode, 200);
    assert.equal(await status(legacy), 401);
    assert.equal(await status(tokenB), 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { token: 'invalid' } })).statusCode, 200);
    const expired = app.jwt.sign({ id: owner.id, scope: 'session', sessionVersion: 0 }, { expiresIn: -1 });
    assert.equal(await status(expired), 401);
    assert.equal(await status(`${tokenB.slice(0, -3)}bad`), 401);
    console.log('PASS JWT legado sem jti revogado; Bearer precede cookie; ausente/inválido/expirado preservados.');

    const concurrentSession = cookieFrom(await login(owner.email));
    const parallelLogout = await Promise.all([1, 2].map(() => app.inject({
      method: 'POST', url: '/api/auth/logout', cookies: { token: concurrentSession },
    })));
    assert.deepEqual(parallelLogout.map(response => response.statusCode), [200, 200]);
    assert.equal(await status(concurrentSession), 401);
    assert.equal(await status(tokenB), 200);
    console.log('PASS logout concorrente é idempotente e não afeta outra sessão.');

    const unavailable = mock.method(prisma, '$queryRaw', async () => { throw new Error('synthetic database outage'); });
    try {
      assert.equal(await status(tokenB), 401);
      const failedLogout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { token: tokenB } });
      assert.equal(failedLogout.statusCode, 503);
      assert.equal(failedLogout.cookies.some(item => item.name === 'token'), false);
    } finally {
      unavailable.mock.restore();
    }
    assert.equal(await status(tokenB), 200);
    console.log('PASS falha de banco nega autenticação e não finge revogação bem-sucedida.');

    // Close this Fastify instance before a separate Node process verifies the
    // same persisted schema with an independently created Prisma connection.
    await app.close();
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/scripts/test-session-logout.ts', '--probe'], {
      env: { ...process.env, SESSION_LOGOUT_TEST_SECRET: secret,
        SESSION_LOGOUT_REVOKED_TEST_TOKEN: tokenA, SESSION_LOGOUT_ACTIVE_TEST_TOKEN: tokenB },
      encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(child.status, 0, 'A validação em outro processo falhou.');
    assert.match(child.stdout, /PASS outro processo reconhece revogação persistida/);
    console.log('PASS reinício/múltiplas instâncias: revogação persistente e sessão B ativa.');
  }
} finally {
  await app.close();
  await prisma.$disconnect();
  if (database) await database.cleanup();
}
