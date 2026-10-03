/** Security regression for SEC-06 using an isolated PostgreSQL schema. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { createTestDatabase } from './postgresql-test-db.js';

const database = await createTestDatabase();
const trustedOrigin = 'https://kindra.example:8443';
process.env.FRONTEND_URL = trustedOrigin;

const { default: prisma } = await import('../db.js');
const { nutritionRoutes } = await import('../routes/nutrition.routes.js');
const app = Fastify({ logger: false });
await app.register(cookie);
await app.register(jwt, { secret: randomBytes(32).toString('hex'), cookie: { cookieName: 'token', signed: false } });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(nutritionRoutes, { prefix: '/api/nutrition' });
await app.ready();

const DAY_MS = 86_400_000;
const todayDate = new Date();
const today = todayDate.toISOString().slice(0, 10);
const yesterday = new Date(todayDate.getTime() - DAY_MS).toISOString().slice(0, 10);
const tomorrow = new Date(todayDate.getTime() + DAY_MS).toISOString().slice(0, 10);
const atNoon = (date: string) => new Date(`${date}T12:00:00.000Z`);

try {
  const owner = await prisma.user.create({
    data: {
      email: 'sec06-owner@example.test',
      emailVerified: true,
      lastActiveDay: new Date(`${yesterday}T00:00:00.000Z`),
      nutritionGoals: { create: { targetKcal: 2000, targetProteinG: 100, targetCarbsG: 200, targetFatG: 60, targetWaterMl: 2000 } },
    },
  });
  const other = await prisma.user.create({
    data: { email: 'sec06-other@example.test', emailVerified: true, lastActiveDay: new Date(`${yesterday}T00:00:00.000Z`) },
  });
  const food = await prisma.food.create({ data: { name: 'SEC-06 alimento', kcal: 2000, proteinG: 100, carbsG: 200, fatG: 60 } });
  await prisma.meal.create({
    data: { userId: owner.id, name: 'LUNCH', loggedAt: atNoon(yesterday), entries: { create: { foodId: food.id, amountGrams: 100 } } },
  });
  await prisma.waterIntakeLog.create({ data: { userId: owner.id, amountMl: 2000, loggedAt: atNoon(yesterday) } });

  const token = app.jwt.sign({ id: owner.id, scope: 'session', sessionVersion: 0 });
  const auth = { authorization: `Bearer ${token}` };
  const mutation = {
    ...auth,
    origin: trustedOrigin,
    'x-kindra-request': 'nutrition-history-consolidation',
  };
  const payload = { referenceDate: today, timezoneOffset: 0 };

  // A read remains harmless even with the previously accepted adjacent date.
  const goalRead = await app.inject({
    method: 'GET', url: `/api/nutrition/goals/current?referenceDate=${tomorrow}&timezoneOffset=0`, headers: auth,
  });
  assert.equal(goalRead.statusCode, 200);
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: owner.id } }), 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).lastActiveDay?.toISOString().slice(0, 10), yesterday);

  for (const headers of [
    auth,
    { ...mutation, origin: 'http://kindra.example:8443' },
    { ...mutation, origin: 'https://kindra.example' },
    { ...mutation, 'sec-fetch-site': 'cross-site' },
    { ...auth, origin: trustedOrigin },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/api/nutrition/history/consolidate', headers, payload });
    assert.equal(response.statusCode, 403);
  }
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: owner.id } }), 0);

  // Sec-Fetch-Site may be absent; a trusted full Origin and intent header remain mandatory.
  for (const referenceDate of [yesterday, tomorrow]) {
    const response = await app.inject({
      method: 'POST', url: '/api/nutrition/history/consolidate', headers: mutation,
      payload: { referenceDate, timezoneOffset: 0 },
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: owner.id } }), 0);

  const consolidated = await app.inject({ method: 'POST', url: '/api/nutrition/history/consolidate', headers: mutation, payload });
  assert.equal(consolidated.statusCode, 200);
  assert.equal(consolidated.json().currentStreak, 1);
  assert.equal(consolidated.json().history.length, 1);
  assert.equal(consolidated.json().history[0].date.slice(0, 10), yesterday);
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: other.id } }), 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).lastActiveDay?.toISOString().slice(0, 10), yesterday);

  const repeated = await app.inject({ method: 'POST', url: '/api/nutrition/history/consolidate', headers: mutation, payload });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json().currentStreak, 1);
  assert.equal(repeated.json().history.length, 1);
  assert.equal(await prisma.historyUserNutri.count({ where: { userId: owner.id } }), 1);

  console.log('PASS SEC-06: GET sem mutação; Origin completo/CSRF; data atual estrita; isolamento; resposta consolidada e idempotência.');
} finally {
  await app.close();
  await prisma.$disconnect();
  await database.cleanup();
}
