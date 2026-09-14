/** Real Fastify + JWT + Prisma integration test in an isolated PostgreSQL schema. */
import assert from 'node:assert/strict';
import { createTestDatabase } from './postgresql-test-db.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

const directory = mkdtempSync(path.join(tmpdir(), 'kindra-water-'));
const database = await createTestDatabase();
const secret = randomBytes(32).toString('hex');
const { default: prisma } = await import('../db.js');
const { nutritionRoutes } = await import('../routes/nutrition.routes.js');
const { getDayBounds } = await import('../utils/timezone.js');
const metricLines: string[] = [];
const app = Fastify({ logger: { stream: { write: (line: string) => metricLines.push(line) } } });
await app.register(cookie);
await app.register(jwt, { secret, cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(nutritionRoutes, { prefix: '/api/nutrition' });
await app.ready();
const offset = 180;
const today = (tz = offset) => new Date(Date.now() - tz * 60_000).toISOString().slice(0, 10);
const context = (tz = offset) => ({ referenceDate: today(tz), timezoneOffset: tz });
const query = (tz = offset) => new URLSearchParams({ referenceDate: today(tz), timezoneOffset: String(tz) }).toString();
let index = 0;
async function account() {
  const user = await prisma.user.create({ data: {
    email: `water-${index++}@example.test`, emailVerified: true,
    lastActiveDay: new Date(`${today()}T00:00:00Z`),
    profile: { create: { firstName: 'Marina', lastName: 'Teste', birthDate: new Date('1994-03-12'), weightKg: 65, heightCm: 168, biologicalSex: 'FEMALE', goal: 'Manutencao', activityLevel: 'Moderado' } },
    nutritionGoals: { create: { targetKcal: 2000, targetProteinG: 120, targetCarbsG: 250, targetFatG: 60, targetWaterMl: 2000 } },
  } });
  return { ...user, token: app.jwt.sign({ id: user.id, scope: 'session' }) };
}
const owner = await account();
const other = await account();
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
async function add(token: string, amountMl: number) {
  const response = await app.inject({ method: 'POST', url: '/api/nutrition/water', headers: headers(token), payload: { amountMl, ...context() } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
async function logs(token: string, tz = offset) {
  const response = await app.inject({ method: 'GET', url: `/api/nutrition/water?${query(tz)}`, headers: headers(token) });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as { id: string; amountMl: number }[];
}
const remove = (token: string, id: string, suffix = query()) => app.inject({ method: 'DELETE', url: `/api/nutrition/water/${id}?${suffix}`, headers: headers(token) });
try {
  const goalBefore = await prisma.nutritionGoal.findFirstOrThrow({ where: { userId: owner.id } });
  const first = await add(owner.token, 250);
  await add(owner.token, 500);
  assert.equal((await logs(owner.token)).reduce((sum, log) => sum + log.amountMl, 0), 750);
  assert.equal((await remove(owner.token, first.id)).statusCode, 204);
  assert.equal((await logs(owner.token)).reduce((sum, log) => sum + log.amountMl, 0), 500);
  const { PrismaClient } = await import('@prisma/client');
  const reopened = new PrismaClient();
  assert.equal(await reopened.waterIntakeLog.findUnique({ where: { id: first.id } }), null);
  await reopened.$disconnect();
  assert.deepEqual(await prisma.nutritionGoal.findFirstOrThrow({ where: { userId: owner.id } }), goalBefore);
  assert.equal((await remove(owner.token, first.id)).statusCode, 404);
  console.log('PASS POST + DELETE + GET: 750 → 500 ml; remoção persistida em nova conexão Prisma; meta intacta; repetição 404.');

  const victim = await add(owner.token, 300);
  const denied = await remove(other.token, victim.id);
  const missing = await remove(other.token, randomUUID());
  assert.equal(denied.statusCode, 404);
  assert.equal(denied.body, missing.body);
  assert.ok(await prisma.waterIntakeLog.findUnique({ where: { id: victim.id } }));
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/nutrition/water/${victim.id}?${query()}` })).statusCode, 401);
  assert.equal((await remove('invalid-token', victim.id)).statusCode, 401);
  assert.equal((await remove(app.jwt.sign({ id: owner.id, scope: 'pending_verification' }), victim.id)).statusCode, 403);
  assert.equal((await remove(app.jwt.sign({ scope: 'session' }), victim.id)).statusCode, 401);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/nutrition/water/${victim.id}?${query()}`, headers: { ...headers(owner.token), 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
  console.log('PASS ownership, IDs não enumeráveis, ausência de sessão, JWT inválido/incompleto, escopo restrito e origem cross-site.');

  const validationUser = await account();
  for (const suffix of [
    'referenceDate=2026-02-30&timezoneOffset=180',
    `referenceDate=${today()}`, `referenceDate=${today()}&timezoneOffset=`,
    `referenceDate=${today()}&timezoneOffset=NaN`, `referenceDate=${today()}&timezoneOffset=9999`,
    `referenceDate=${today()}&timezoneOffset=1.5`, `${query()}&userId=${owner.id}`, `${query()}&amountMl=-500`,
    'referenceDate=2000-01-01&timezoneOffset=180',
  ]) assert.equal((await remove(validationUser.token, victim.id, suffix)).statusCode, 400, suffix);
  assert.equal((await remove(validationUser.token, 'invalid-id')).statusCode, 400);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/nutrition/water/${victim.id}?${query()}`, headers: headers(validationUser.token), payload: { amountMl: -500 } })).statusCode, 400);
  const bounds = getDayBounds(today(), offset);
  const old = await prisma.waterIntakeLog.create({ data: { userId: validationUser.id, amountMl: 250, loggedAt: new Date(bounds.startOfDayUTC.getTime() - 1) } });
  assert.equal((await remove(validationUser.token, old.id)).statusCode, 404);
  const consolidatedLog = await add(validationUser.token, 250);
  await prisma.historyUserNutri.create({ data: { userId: validationUser.id, date: new Date(`${today()}T00:00:00Z`), targetWaterMl: 2000, targetKcal: 2000 } });
  assert.equal((await remove(validationUser.token, consolidatedLog.id)).statusCode, 404);
  assert.ok(await prisma.waterIntakeLog.findUnique({ where: { id: consolidatedLog.id } }));
  console.log('PASS Zod: UUID, datas reais, timezone obrigatório/inteiro/limites, corpo e campos extras; passado e dia consolidado bloqueados.');

  const concurrentUser = await account();
  const concurrentLog = await add(concurrentUser.token, 500);
  const results = await Promise.all(Array.from({ length: 5 }, () => remove(concurrentUser.token, concurrentLog.id)));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [204, 404, 404, 404, 404]);
  assert.deepEqual(await logs(concurrentUser.token), []);
  console.log('PASS concorrência: 5 remoções simultâneas, apenas 1 efetiva; consumo final 0, nunca negativo.');

  for (const tz of [-180, 180, 330]) {
    const user = await account();
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveDay: new Date(`${today(tz)}T00:00:00Z`) } });
    const { startOfDayUTC } = getDayBounds(today(tz), tz);
    const inDay = await prisma.waterIntakeLog.create({ data: { userId: user.id, amountMl: 200, loggedAt: startOfDayUTC } });
    const beforeDay = await prisma.waterIntakeLog.create({ data: { userId: user.id, amountMl: 100, loggedAt: new Date(startOfDayUTC.getTime() - 1) } });
    assert.deepEqual((await logs(user.token, tz)).map(log => log.id), [inDay.id]);
    assert.equal((await remove(user.token, beforeDay.id, query(tz))).statusCode, 404);
    assert.equal((await remove(user.token, inDay.id, query(tz))).statusCode, 204);
  }
  console.log('PASS timezone: mesmos limites do GET, incluindo meia-noite e 1 ms anterior, offsets -180, 180 e 330.');

  const limitedUser = await account();
  for (let i = 0; i < 20; i++) assert.equal((await remove(limitedUser.token, randomUUID())).statusCode, 404);
  const limited = await remove(limitedUser.token, randomUUID());
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
  assert.equal((await remove(other.token, randomUUID())).statusCode, 404);
  console.log('PASS rate limit: 20 tentativas/min por sessão de usuário, 21ª = 429 com Retry-After; outro usuário não bloqueado.');

  const metrics = metricLines.flatMap(line => line.trim().split('\n')).map(line => JSON.parse(line)).filter(line => line.event === 'security.water_delete');
  for (const outcome of ['removed', 'unauthenticated', 'forbidden', 'invalid_input', 'unavailable', 'rate_limited']) assert.ok(metrics.some(m => m.outcome === outcome), outcome);
  assert.ok(metrics.every(m => m.count === 1 && m.durationMs >= 0 && !('userId' in m) && !('token' in m)));
  console.log('PASS métricas de segurança:', JSON.stringify(metrics.reduce((counts, m) => { counts[m.outcome] = (counts[m.outcome] || 0) + 1; return counts; }, {} as Record<string, number>)));
  console.log('EVIDÊNCIA de métrica:', JSON.stringify(metrics.find(m => m.outcome === 'removed')));

  if (process.argv.includes('--serve')) {
    // Serve the real frontend and real route plugins against this test database.
    const uiUser = await account();
    await add(uiUser.token, 250);
    await add(uiUser.token, 500);
    const ui = Fastify({ logger: false });
    await ui.register(cookie);
    await ui.register(jwt, { secret, cookie: { cookieName: 'token', signed: false } });
    await ui.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    const { authRoutes } = await import('../routes/auth.routes.js');
    const { mealRoutes } = await import('../routes/meal.routes.js');
    await ui.register(authRoutes, { prefix: '/api/auth' });
    await ui.register(nutritionRoutes, { prefix: '/api/nutrition' });
    await ui.register(mealRoutes, { prefix: '/api/meals' });
    const { default: staticFiles } = await import('@fastify/static');
    await ui.register(staticFiles, { root: path.resolve('dist') });
    ui.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'Rota não encontrada.' });
      return reply.sendFile('index.html');
    });
    const address = await ui.listen({ host: '127.0.0.1', port: 5180 });
    writeFileSync(path.join(directory, 'browser.json'), JSON.stringify({ token: uiUser.token, address }), { mode: 0o600 });
    console.log(`UI real pronta. Credencial exclusiva de teste em ${directory}/browser.json`);
    const shutdown = async () => { await ui.close(); await prisma.$disconnect(); await database.cleanup(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
} finally {
  await app.close();
  if (!process.argv.includes('--serve')) {
    await prisma.$disconnect();
    await database.cleanup();
  }
}
