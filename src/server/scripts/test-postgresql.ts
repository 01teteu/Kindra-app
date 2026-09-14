/** Real route/database regression and reconstruction test; no database/auth mocks. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { createTestDatabase, runPrisma } from './postgresql-test-db.js';

const mainUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['postgresql:', 'postgres:'].includes(mainUrl.protocol) ||
    !['localhost', '127.0.0.1'].includes(mainUrl.hostname)) {
  throw new Error('Os testes exigem PostgreSQL local.');
}
const main = new PrismaClient({ datasources: { db: { url: mainUrl.toString() } } });
const catalogBefore = await main.food.findMany({ orderBy: { id: 'asc' } });
const usersBefore = await main.user.count();
if (process.argv.includes('--verify-main-seed')) {
  const output = runPrisma(['db', 'seed']);
  assert.match(output, /"inserted": 0/);
  assert.deepEqual(await main.food.findMany({ orderBy: { id: 'asc' } }), catalogBefore);
  console.log(`PASS segundo seed principal: ${catalogBefore.length} alimentos, 0 inserções; IDs, macros e timestamps idênticos.`);
}
const database = await createTestDatabase();
const { default: prisma } = await import('../db.js');
const { userRoutes } = await import('../routes/user.routes.js');
const { authRoutes } = await import('../routes/auth.routes.js');
const { profileRoutes } = await import('../routes/profile.routes.js');
const { nutritionRoutes } = await import('../routes/nutrition.routes.js');
const { mealRoutes } = await import('../routes/meal.routes.js');
const { checkAndConsolidateNutriHistory } = await import('../services/nutrition.service.js');
const secret = randomBytes(32).toString('hex');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret, cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(profileRoutes, { prefix: '/api/profile' });
await app.register(nutritionRoutes, { prefix: '/api/nutrition' });
await app.register(mealRoutes, { prefix: '/api/meals' });
await app.ready();
const context = { referenceDate: new Date(Date.now() - 180 * 60000).toISOString().slice(0, 10), timezoneOffset: 180 };
const query = new URLSearchParams({ referenceDate: context.referenceDate, timezoneOffset: '180' }).toString();
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
let server: ChildProcess | undefined;
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  server = undefined;
}
async function startServer() {
  server = spawn(process.execPath, ['dist/server.cjs'], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Capture startup only; never print API logs or tokens.
  let ready = false;
  server.stdout!.on('data', chunk => { if (chunk.toString().includes('Servidor rodando')) ready = true; });
  server.stderr!.resume();
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Servidor de teste não iniciou; confira a porta 3000 e o build.');
    if (ready) return;
    await delay(100);
  }
  throw new Error('Timeout ao iniciar servidor de teste.');
}
try {
  assert.deepEqual(await prisma.$queryRaw`SELECT 1 AS connected`, [{ connected: 1 }]);
  assert.equal(await prisma.food.count(), 0);
  assert.equal(await prisma.user.count(), 0);
  const firstSeed = runPrisma(['db', 'seed']);
  assert.match(firstSeed, /"invalidSkipped": 53/);
  assert.match(firstSeed, /"conflictingRecordsSkipped": 2/);
  assert.match(firstSeed, /"inserted": 640/);
  const catalog = await prisma.food.findMany({ orderBy: { id: 'asc' } });
  assert.equal(catalog.length, 640);
  assert.match(runPrisma(['db', 'seed']), /"inserted": 0/);
  assert.deepEqual(await prisma.food.findMany({ orderBy: { id: 'asc' } }), catalog);
  assert.match(runPrisma(['migrate', 'status']), /up to date/);
  console.log('PASS reconstrução: schema vazio + migrate deploy + seed = 640 alimentos; segundo seed preserva todos os campos.');

  const password = `Pg-${randomBytes(18).toString('hex')}!`;
  async function register(email: string) {
    // Observe the pre-existing development email output without replacing any service.
    const log = console.log;
    let verificationCode = '';
    console.log = (...args: unknown[]) => {
      const line = args.join(' ');
      if (line.includes(`[MOCK EMAIL] Código de Verificação para ${email}:`)) {
        verificationCode = line.match(/: (\d{6})$/)?.[1] ?? '';
      }
    };
    let response;
    try {
      response = await app.inject({ method: 'POST', url: '/api/users/register', payload: { email, password } });
    } finally { console.log = log; }
    assert.equal(response.statusCode, 201);
    assert.match(verificationCode, /^\d{6}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.notEqual(user.password, password);
    assert.ok(await bcrypt.compare(password, user.password!));
    const stored = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(stored.token, createHash('sha256').update(verificationCode).digest('hex'));
    assert.equal((await app.inject({ url: `/api/meals?${query}`, headers: headers(response.json().pendingToken) })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/verify-email/confirm', payload: { token: verificationCode } })).statusCode, 200);
    assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 0);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/verify-email/confirm', payload: { token: verificationCode } })).statusCode, 400);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    assert.equal(login.statusCode, 200);
    const sessionCookie = login.cookies.find(c => c.name === 'token');
    assert.ok(sessionCookie?.httpOnly);
    assert.equal(!!sessionCookie.secure, process.env.NODE_ENV === 'production');
    assert.equal(sessionCookie.sameSite, 'Lax');
    const token = sessionCookie.value;
    assert.equal(app.jwt.verify<{ scope: string }>(token).scope, 'session');
    return { id: user.id, email, token };
  }
  const owner = await register('postgres-owner@example.test');
  const other = await register('postgres-other@example.test');
  console.log('PASS cadastro → hash bcrypt/token SHA-256 → verificação de uso único → login real → cookie/JWT de sessão. E-mail usa saída dev existente.');
  const profile = {
    firstName: 'Marina', lastName: 'Teste', birthDate: '1994-03-12', weightKg: 65, heightCm: 168,
    biologicalSex: 'FEMALE', goal: 'Manutencao', activityLevel: 'Moderado', isPCD: false,
    allergies: ['Restrição teste PostgreSQL'], limitations: ['Limitação teste PostgreSQL'],
  };
  assert.equal((await app.inject({ method: 'POST', url: '/api/profile/', headers: headers(owner.token), payload: profile })).statusCode, 201);
  const savedProfile = await prisma.profile.findUniqueOrThrow({ where: { userId: owner.id }, include: { allergies: true, physicalLimitations: true } });
  assert.equal(savedProfile.allergies.length, 1);
  assert.equal(savedProfile.physicalLimitations.length, 1);
  assert.equal((await app.inject({ method: 'POST', url: '/api/profile/', headers: headers(owner.token), payload: profile })).statusCode, 409);
  const goalResponse = await app.inject({ url: `/api/nutrition/goals/current?${query}`, headers: headers(owner.token) });
  assert.equal(goalResponse.statusCode, 200);
  const goal = goalResponse.json();
  const age = Math.floor((Date.now() - Date.parse(profile.birthDate)) / (365.25 * 86400000));
  const kcal = (650 + 1050 - 5 * age - 161) * 1.55;
  assert.equal(goal.targetKcal, Math.round(kcal));
  assert.equal(goal.targetProteinG, 104);
  assert.equal(goal.targetFatG, 65);
  assert.equal(goal.targetCarbsG, Math.round((kcal - 416 - 585) / 4));
  assert.equal(goal.targetWaterMl, 2275);
  assert.equal((await app.inject({ url: `/api/nutrition/goals/current?${query}`, headers: headers(other.token) })).statusCode, 404);
  console.log(`PASS onboarding, relações N:N e metas calculadas: ${goal.targetKcal} kcal, 104g proteína, ${goal.targetCarbsG}g carboidrato, 65g gordura, 2275ml água.`);

  const mealPayload = { foodId: catalog[0].id, category: 'LUNCH', amountGrams: 125.5, ...context };
  const meal = await app.inject({ method: 'POST', url: '/api/meals/entries', headers: headers(owner.token), payload: mealPayload });
  assert.equal(meal.statusCode, 201);
  const entryId = meal.json().entry.id;
  const mealsResponse = await app.inject({ url: `/api/meals?${query}`, headers: headers(owner.token) });
  assert.equal(mealsResponse.statusCode, 200);
  const meals = mealsResponse.json();
  assert.equal(meals[0].entries[0].amountGrams, 125.5);
  assert.equal(meals[0].entries[0].food.kcal, catalog[0].kcal);
  assert.deepEqual((await app.inject({ url: `/api/meals?${query}`, headers: headers(other.token) })).json(), []);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/meals/entries/${entryId}`, headers: headers(other.token) })).statusCode, 404);
  const privateFood = await prisma.food.create({ data: { name: 'Alimento privado teste', isCustom: true, userId: owner.id, kcal: 100 } });
  assert.equal((await app.inject({ method: 'POST', url: '/api/meals/entries', headers: headers(other.token), payload: { ...mealPayload, foodId: privateFood.id } })).statusCode, 403);
  for (const amountMl of [250, 500]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/nutrition/water', headers: headers(owner.token), payload: { amountMl, ...context } })).statusCode, 201);
  }
  const water = (await app.inject({ url: `/api/nutrition/water?${query}`, headers: headers(owner.token) })).json();
  assert.equal(water.reduce((sum, item) => sum + item.amountMl, 0), 750);
  assert.deepEqual((await app.inject({ url: `/api/nutrition/water?${query}`, headers: headers(other.token) })).json(), []);
  console.log('PASS refeições: 125,5g e macros persistidos; hidratação: 750ml; leituras/escritas isoladas entre dois usuários.');

  for (const token of ['', 'invalid', app.jwt.sign({ id: owner.id, scope: 'session' }, { expiresIn: -1 })]) {
    assert.equal((await app.inject({ url: `/api/meals?${query}`, headers: headers(token) })).statusCode, 401);
  }
  for (const scope of ['pending_verification', 'reset_password']) {
    assert.equal((await app.inject({ url: `/api/meals?${query}`, headers: headers(app.jwt.sign({ id: owner.id, scope })) })).statusCode, 403);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/users/register', payload: { email: 'invalid', password: 'weak' } })).statusCode, 400);
  for (const invalid of [{ amountGrams: -1 }, { amountGrams: 3001 }, { timezoneOffset: 99999 }, { foodId: 'invalid' }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/meals/entries', headers: headers(owner.token), payload: { ...mealPayload, ...invalid } })).statusCode, 400);
  }
  for (let i = 0; i < 5; i++) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.2', payload: { email: owner.email, password: 'wrong' } })).statusCode, 401);
  }
  const blocked = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '127.0.0.2', payload: { email: owner.email, password } });
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  console.log('PASS JWT ausente/inválido/expirado/restrito, Zod e login: 5 senhas erradas = 401; sexta tentativa = 429 + Retry-After.');

  // A separate account exercises relational aggregates and historical timestamps.
  const historyUser = await prisma.user.create({ data: {
    email: 'postgres-history@example.test', lastActiveDay: new Date('2026-09-07T00:00:00Z'),
    nutritionGoals: { create: { targetKcal: 2000, targetProteinG: 150, targetCarbsG: 200, targetFatG: 50, targetWaterMl: 2000 } },
  } });
  const historyFood = await prisma.food.create({ data: { name: 'Histórico teste', kcal: 2000, proteinG: 150, carbsG: 200, fatG: 50 } });
  await prisma.meal.create({ data: { userId: historyUser.id, name: 'LUNCH', loggedAt: new Date('2026-09-08T12:00:00Z'), entries: { create: { foodId: historyFood.id, amountGrams: 100 } } } });
  await prisma.waterIntakeLog.create({ data: { userId: historyUser.id, amountMl: 2000, loggedAt: new Date('2026-09-08T12:00:00Z') } });
  await checkAndConsolidateNutriHistory(historyUser.id, '2026-09-09', 0);
  const history = await prisma.historyUserNutri.findMany({ where: { userId: historyUser.id }, orderBy: { date: 'asc' } });
  assert.equal(history.length, 2);
  assert.equal(history[0].consumedKcal, 0);
  assert.equal(history[1].consumedKcal, 2000);
  for (const key of ['waterGoalAchieved', 'kcalGoalAchieved', 'proteinGoalAchieved', 'carbsGoalAchieved', 'fatGoalAchieved']) assert.equal(history[1][key], true);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: historyUser.id } })).currentStreak, 1);
  await checkAndConsolidateNutriHistory(historyUser.id, '2026-09-09', 0);
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: historyUser.id } }), 2);
  console.log('PASS consolidação retroativa: 2 dias, segundo dia 2000 kcal/2000ml e cinco metas atingidas, streak 1, repetição sem duplicação.');

  // The real bundled application runs in a child process, using only our schema.
  await startServer();
  async function readPersistedHTTP() {
    const response = await fetch(`http://127.0.0.1:3000/api/meals?${query}`, { headers: headers(owner.token) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), meals);
    const hydration = await fetch(`http://127.0.0.1:3000/api/nutrition/water?${query}`, { headers: headers(owner.token) });
    assert.equal(hydration.status, 200);
    assert.deepEqual(await hydration.json(), water);
  }
  await readPersistedHTTP();
  await stopServer();
  if (process.argv.includes('--restart-container')) {
    execFileSync('docker', ['restart', 'kindra-app-db-1'], { stdio: 'pipe' });
    let connected = false;
    for (let i = 0; i < 60; i++) {
      try { await prisma.$queryRaw`SELECT 1`; connected = true; break; } catch { await delay(500); }
    }
    assert.ok(connected, 'PostgreSQL não voltou após reinício.');
  }
  await startServer();
  await readPersistedHTTP();
  const persistedGoal = await prisma.nutritionGoal.findUniqueOrThrow({ where: { id: goal.id } });
  assert.equal(persistedGoal.targetKcal, goal.targetKcal);
  assert.deepEqual(await prisma.profile.findUniqueOrThrow({ where: { userId: owner.id }, include: { allergies: true, physicalLimitations: true } }), savedProfile);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, true);
  await stopServer();
  console.log(`PASS persistência HTTP após reiniciar processo da aplicação${process.argv.includes('--restart-container') ? ' e container PostgreSQL existente' : ''}: refeições, água, perfil, metas e sessão preservados.`);

  await assert.rejects(prisma.waterIntakeLog.create({ data: { userId: randomUUID(), amountMl: 250 } }), { code: 'P2003' });
  await assert.rejects(prisma.user.create({ data: { email: owner.email } }), { code: 'P2002' });
  await assert.rejects(prisma.food.delete({ where: { id: catalog[0].id } }), { code: 'P2003' });
  // Only delete the synthetic owner in this run's private schema.
  await prisma.user.delete({ where: { id: owner.id } });
  assert.equal(await prisma.profile.count({ where: { userId: owner.id } }), 0);
  assert.equal(await prisma.profileAllergy.count({ where: { profileId: savedProfile.id } }), 0);
  assert.equal(await prisma.profilePhysicalLimitation.count({ where: { profileId: savedProfile.id } }), 0);
  assert.equal(await prisma.meal.count({ where: { userId: owner.id } }), 0);
  assert.equal(await prisma.mealEntry.count({ where: { id: entryId } }), 0);
  assert.equal(await prisma.waterIntakeLog.count({ where: { userId: owner.id } }), 0);
  assert.equal(await prisma.nutritionGoal.count({ where: { userId: owner.id } }), 0);
  assert.equal((await prisma.food.findUniqueOrThrow({ where: { id: privateFood.id } })).userId, null);
  assert.ok(await prisma.user.findUnique({ where: { id: other.id } }));
  assert.equal(await prisma.food.count({ where: { id: { in: catalog.map(food => food.id) } } }), 640);
  console.log('PASS FK/unique/restrict, cascades usuário→perfil→associações e usuário→refeições→itens/água/metas; alimento privado SET NULL, outro usuário e TACO intactos.');
} finally {
  await stopServer();
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
  try {
    await main.$disconnect();
    assert.deepEqual(await main.food.findMany({ orderBy: { id: 'asc' } }), catalogBefore);
    assert.equal(await main.user.count(), usersBefore);
    console.log('PASS banco principal preservado e schema temporário removido.');
  } finally { await main.$disconnect(); }
}
