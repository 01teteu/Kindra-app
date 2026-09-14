import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { Prisma } from '@prisma/client';
import { createTestDatabase } from './postgresql-test-db.js';
import { trainingToday } from '../../shared/weeklyTraining.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify({ logger: { level: 'error' } });
await app.register(jwt, { secret: randomUUID() });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
try {
  const a = await db.user.create({ data: { email: 'weekly-a@example.test' } });
  const b = await db.user.create({ data: { email: 'weekly-b@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const raw = (method: Method, path: string, payload?: object, auth = token(a.id)) => app.inject({ method,
    url: `/api/workouts${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
  const req = async (method: Method, path: string, payload?: object, status = 200, auth = token(a.id)) => {
    const r = await raw(method, path, payload, auth);
    assert.equal(r.statusCode, status, `${method} ${path}: ${r.body}`); return r.json();
  };
  const exercise = await db.exercise.create({ data: { name: 'Supino', slug: 'weekly-supino', origin: 'GLOBAL',
    primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [],
    muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Execute com controle.' } });
  const r1 = await db.routine.create({ data: { userId: a.id, name: 'Push A', exercises: { create: [
    { exerciseId: exercise.id, order: 0, notes: 'Controle' }, { exerciseId: exercise.id, order: 1 },
  ] } } });
  const r2 = await db.routine.create({ data: { userId: a.id, name: 'Upper', exercises: { create: { exerciseId: exercise.id } } } });
  const foreignRoutine = await db.routine.create({ data: { userId: b.id, name: 'Privada' } });
  assert.equal(await req('GET', '/plans/active'), null);
  assert.deepEqual(await req('GET', '/plans'), []);
  for (const payload of [{ name: '', source: 'CUSTOM' }, { name: 'A', source: 'INVALID' }, { name: 'A', source: 'CUSTOM', userId: b.id },
    { name: 'A', source: 'CUSTOM', days: [{ dayOfWeek: 'MONDAY', routineId: r1.id }, { dayOfWeek: 'MONDAY', routineId: r2.id }] }])
    await req('POST', '/plans', payload, 400);
  const p1 = await req('POST', '/plans', { name: ' Semana A ', source: 'CUSTOM', days: [
    { dayOfWeek: 'MONDAY', routineId: r1.id }, { dayOfWeek: 'FRIDAY', routineId: r1.id },
  ] }, 201);
  assert.equal(p1.name, 'Semana A'); assert.equal(p1.isActive, true); assert.equal(p1.days.length, 2);
  assert.equal(p1.days[0].routine.exerciseCount, 2); assert.equal('exercises' in p1.days[0].routine, false);
  const p2 = await req('POST', '/plans', { name: 'Semana B', source: 'GENERATED' }, 201);
  assert.equal(p2.isActive, false); assert.deepEqual(p2.days, []);
  assert.equal((await req('GET', '/plans/active')).id, p1.id);
  const pb = await req('POST', '/plans', { name: 'Privado', source: 'CUSTOM' }, 201, token(b.id));
  assert.deepEqual(new Set((await req('GET', '/plans')).map((p: any) => p.id)), new Set([p1.id, p2.id]));
  assert.deepEqual((await req('GET', '/routines?summary=true')).map((r: any) => r.exerciseCount).sort(), [1, 2]);
  const paths: [Method, string, object?][] = [
    ['GET', ''], ['PATCH', '', { name: 'Hack' }], ['POST', '/activate', {}],
    ['PUT', '/days/MONDAY', { routineId: r1.id }], ['DELETE', '/days/MONDAY'],
  ];
  for (const [method, suffix, payload] of paths) {
    const foreign = await req(method, `/plans/${pb.id}${suffix}`, payload, 404);
    assert.deepEqual(await req(method, `/plans/${randomUUID()}${suffix}`, payload, 404), foreign);
  }
  for (const id of [foreignRoutine.id, randomUUID()]) {
    assert.deepEqual(await req('PUT', `/plans/${p1.id}/days/TUESDAY`, { routineId: id }, 404), { error: 'Rotina não encontrada.' });
    await req('POST', '/plans', { name: 'Inválido', source: 'CUSTOM', days: [{ dayOfWeek: 'MONDAY', routineId: id }] }, 404);
  }
  for (const [method, path, payload] of [['GET', '/plans'], ['POST', '/plans', { name: 'A', source: 'CUSTOM' }],
    ...paths.map(([method, suffix, payload]) => [method, `/plans/${p1.id}${suffix}`, payload])] as [Method, string, object?][]) {
    await req(method, path, payload, 401, 'invalid');
    await req(method, path, payload, 403, token(a.id, 'reset_password'));
  }
  await req('PUT', `/plans/${p1.id}/days/monday`, { routineId: r1.id }, 400);
  await req('PATCH', '/plans/invalid', { name: 'A' }, 400);
  await req('POST', `/plans/${p1.id}/activate`, { userId: b.id }, 400);
  assert.equal((await req('PATCH', `/plans/${p1.id}`, { name: 'Renomeado' })).name, 'Renomeado');
  assert.equal((await req('PUT', `/plans/${p1.id}/days/TUESDAY`, { routineId: r1.id })).days.length, 3);
  const changed = await req('PUT', `/plans/${p1.id}/days/TUESDAY`, { routineId: r2.id });
  assert.equal(changed.days.find((d: any) => d.dayOfWeek === 'TUESDAY').routine.exerciseCount, 1);
  assert.equal((await req('DELETE', `/plans/${p1.id}/days/TUESDAY`)).days.length, 2);
  assert.equal((await req('DELETE', `/plans/${p1.id}/days/TUESDAY`)).days.length, 2);
  await req('POST', `/plans/${p2.id}/activate`);
  assert.equal((await req('GET', '/plans/active')).id, p2.id);
  assert.equal((await req('GET', `/plans/${p1.id}`)).isActive, false);
  await assert.rejects(db.weeklyTrainingPlan.update({ where: { id: p1.id }, data: { isActive: true } }), { code: 'P2002' });
  await assert.rejects(db.weeklyTrainingDay.create({ data: { planId: p1.id, dayOfWeek: 'MONDAY', routineId: r2.id } }), { code: 'P2002' });
  const sqlFails = async (query: Prisma.Sql, code = '23514') => assert.rejects(db.$executeRaw(query), (error: any) => {
    assert.equal(error.code, 'P2010'); assert.equal(error.meta?.code, code); return true;
  });
  await sqlFails(Prisma.sql`INSERT INTO weekly_training_days (id,"planId","dayOfWeek","routineId","updatedAt") VALUES (${randomUUID()},${p1.id},'SUNDAY',${foreignRoutine.id},now())`);
  await sqlFails(Prisma.sql`UPDATE weekly_training_days SET "routineId"=${foreignRoutine.id} WHERE "planId"=${p1.id}`);
  await sqlFails(Prisma.sql`UPDATE weekly_training_days SET "planId"=${pb.id} WHERE "planId"=${p1.id}`);
  await sqlFails(Prisma.sql`UPDATE weekly_training_plans SET "userId"=${b.id} WHERE id=${p1.id}`);
  await sqlFails(Prisma.sql`UPDATE routines SET "userId"=${b.id} WHERE id=${r1.id}`);
  await assert.rejects(db.weeklyTrainingDay.create({ data: { planId: randomUUID(), dayOfWeek: 'MONDAY', routineId: r1.id } }), { code: 'P2003' });
  await assert.rejects(db.weeklyTrainingDay.create({ data: { planId: p1.id, dayOfWeek: 'SUNDAY', routineId: randomUUID() } }), { code: 'P2003' });
  for (let round = 0; round < 4; round++) {
    const responses = await Promise.all([p1.id, p2.id].map(id => raw('POST', `/plans/${id}/activate`)));
    responses.forEach(r => assert.equal(r.statusCode, 200, r.body));
    assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: a.id, isActive: true } }), 1);
  }
  const c = await db.user.create({ data: { email: 'weekly-concurrent@example.test' } });
  const created = await Promise.all(['C1', 'C2'].map(name => req('POST', '/plans', { name, source: 'CUSTOM' }, 201, token(c.id))));
  assert.equal(created.filter(p => p.isActive).length, 1);
  assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: c.id, isActive: true } }), 1);
  console.log('PASS API: criação/primeiro ativo/CRUD, payload compacto, JWT, anti-enumeration, ownership SQL, FKs, unicidades e concorrência.');

  await req('POST', `/plans/${p1.id}/activate`);
  const plan = await req('GET', '/plans/active');
  assert.equal(trainingToday(plan, new Date(2026, 8, 14, 12))?.routineId, r1.id);
  assert.equal(trainingToday(plan, new Date(2026, 8, 17, 12)), null);
  const session = await req('POST', '/sessions', { routineId: trainingToday(plan, new Date(2026, 8, 14, 12))!.routineId }, 201);
  assert.equal(session.exercises.length, 2);
  assert.deepEqual(session.exercises.map((e: any) => [e.exerciseId, e.exerciseNameSnapshot, e.order]), [[exercise.id, 'Supino', 0], [exercise.id, 'Supino', 1]]);
  assert.equal(session.exercises[0].notes, 'Controle');
  await req('POST', '/sessions', { routineId: r2.id }, 409);
  assert.equal((await req('GET', '/sessions/active')).id, session.id);
  assert.equal(await db.workoutSession.count({ where: { userId: a.id, status: 'ACTIVE' } }), 1);
  await db.routine.update({ where: { id: r1.id }, data: { name: 'Mudou' } });
  await db.routineExercise.deleteMany({ where: { routineId: r1.id } });
  await db.exercise.update({ where: { id: exercise.id }, data: { name: 'Catálogo mudou' } });
  await req('PUT', `/plans/${p1.id}/days/MONDAY`, { routineId: r2.id });
  await req('PATCH', `/plans/${p1.id}`, { name: 'Plano mudou' });
  await req('POST', `/plans/${p2.id}/activate`);
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), session);
  const completed = await req('POST', `/sessions/${session.id}/finish`, {});
  await db.weeklyTrainingPlan.delete({ where: { id: p1.id } });
  assert.equal(await db.weeklyTrainingDay.count({ where: { planId: p1.id } }), 0);
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), completed);
  await req('PUT', `/plans/${p2.id}/days/SUNDAY`, { routineId: r1.id });
  await db.routine.delete({ where: { id: r1.id } });
  assert.deepEqual((await req('GET', `/plans/${p2.id}`)).days, []);
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), { ...completed, routineId: null });
  await db.user.delete({ where: { id: c.id } });
  assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: c.id } }), 0);
  const indexes = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname = ${database.schema} AND tablename IN ('weekly_training_plans','weekly_training_days')`;
  assert.ok(indexes.some(i => i.indexname === 'weekly_training_plans_one_active_per_user_key' && /UNIQUE.*WHERE/.test(i.indexdef)));
  assert.ok(indexes.some(i => i.indexname === 'weekly_training_days_planId_dayOfWeek_key' && i.indexdef.includes('UNIQUE')));
  const migrations = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert.ok(migrations.some(m => m.migration_name === '20260914120000_weekly_training_plans'));
  console.log('PASS integração: hoje/descanso, start existente, ACTIVE única, snapshots e histórico independentes, deletes preservados, migration real.');
} finally { await app.close(); await db.$disconnect(); await database.cleanup(); }
