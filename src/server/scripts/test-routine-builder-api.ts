import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { Prisma } from '@prisma/client';
import { createTestDatabase } from './postgresql-test-db.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
try {
  const owner = await db.user.create({ data: { email: 'builder-a@example.test' } });
  const other = await db.user.create({ data: { email: 'builder-b@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const raw = (method: Method, path: string, payload?: object, auth = token(owner.id)) => app.inject({ method,
    url: `/api/workouts${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
  const req = async (method: Method, path: string, payload?: object, status = 200, auth = token(owner.id)) => {
    const response = await raw(method, path, payload, auth);
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return status === 204 ? response.body : response.json();
  };
  const base = { name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS' as const,
    aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL' as const, instructions: 'Execute com controle.' };
  const global = await db.exercise.create({ data: { ...base, slug: 'builder-global', origin: 'GLOBAL' } });
  const custom = await db.exercise.create({ data: { ...base, name: 'Inclinado', slug: 'builder-custom', origin: 'CUSTOM', userId: owner.id } });
  const foreign = await db.exercise.create({ data: { ...base, slug: 'builder-custom', origin: 'CUSTOM', userId: other.id } });
  const inactive = await db.exercise.create({ data: { ...base, slug: 'builder-inactive', origin: 'GLOBAL', isActive: false } });
  const foreignRoutine = await db.routine.create({ data: { userId: other.id, name: 'Privada' } });
  const exercise = (id: string, order = 0, notes: string | null = null, restTime: number | null = null) => ({ exerciseId: id, order, notes, restTime });
  const empty = await req('POST', '/routines', { name: ' Vazia ', exercises: [] }, 201);
  assert.equal(empty.name, 'Vazia'); assert.deepEqual(empty.exercises, []);
  const routine = await req('POST', '/routines', { name: 'Treino A', exercises: [
    exercise(global.id, 2, 'Controle', 90), exercise(custom.id, 0, ' Inclinação ', null), exercise(global.id, 1, null, 0),
  ] }, 201);
  assert.deepEqual(routine.exercises.map((e: any) => [e.exerciseId, e.order, e.notes, e.restTime]), [
    [custom.id, 0, 'Inclinação', null], [global.id, 1, null, 0], [global.id, 2, 'Controle', 90],
  ]);
  assert.deepEqual(await req('GET', `/routines/${routine.id}`), routine);
  const list = await req('GET', '/routines');
  assert.deepEqual(new Set(list.map((r: any) => r.id)), new Set([empty.id, routine.id]));
  assert.equal((await req('GET', '/routines?summary=true')).find((r: any) => r.id === routine.id).exerciseCount, 3);
  assert.equal((await req('PATCH', `/routines/${routine.id}`, { name: 'Renomeada' })).name, 'Renomeada');
  assert.deepEqual((await req('GET', `/routines/${routine.id}`)).exercises, routine.exercises);
  for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { name: 'Hack' }], ['DELETE', '', undefined]] as const) {
    const result = await req(method, `/routines/${foreignRoutine.id}${suffix}`, body, 404);
    assert.deepEqual(await req(method, `/routines/${randomUUID()}${suffix}`, body, 404), result);
  }
  const invalidPayloads = [
    { name: '' }, {}, { userId: other.id }, { name: 'x'.repeat(101) },
    { exercises: [exercise(global.id, 0), exercise(custom.id, 0)] },
    ...[-1, 1.5, 2147483648].map(restTime => ({ exercises: [exercise(global.id, 0, null, restTime)] })),
    { exercises: [{ ...exercise(global.id), restTime: '90' }] },
    { exercises: [exercise(global.id, -1)] }, { exercises: [exercise(global.id, 0, 'x'.repeat(501))] },
    { exercises: [{ ...exercise(global.id), restTimeSnapshot: 50 }] },
  ];
  for (const payload of invalidPayloads) await req('PATCH', `/routines/${routine.id}`, payload, 400);
  const before = await req('GET', `/routines/${routine.id}`);
  for (const id of [foreign.id, inactive.id, randomUUID()]) {
    await req('POST', '/routines', { name: 'Indevida', exercises: [exercise(id)] }, 404);
    await req('PATCH', `/routines/${routine.id}`, { name: 'Não salvar', exercises: [exercise(global.id), exercise(id, 1)] }, 404);
    assert.deepEqual(await req('GET', `/routines/${routine.id}`), before);
  }
  for (const [method, path, payload] of [
    ['POST', '/routines', { name: 'A', exercises: [] }], ['GET', '/routines', undefined],
    ['GET', `/routines/${routine.id}`, undefined], ['PATCH', `/routines/${routine.id}`, { name: 'A' }], ['DELETE', `/routines/${routine.id}`, undefined],
  ] as [Method, string, object?][]) {
    await req(method, path, payload, 401, 'invalid');
    await req(method, path, payload, 403, token(owner.id, 'reset_password'));
  }
  await req('GET', '/routines/invalid', undefined, 400);
  const removed = await req('PATCH', `/routines/${routine.id}`, { exercises: [exercise(global.id, 0, 'Primeiro', 120)] });
  assert.equal(removed.exercises.length, 1);
  assert.equal(await db.routineExercise.count({ where: { routineId: routine.id } }), 1);
  const newList = [exercise(custom.id, 1, 'Segundo', 90), exercise(global.id, 0, 'Primeiro', 120)];
  const edited = await req('PATCH', `/routines/${routine.id}`, { name: 'Final', exercises: newList });
  assert.deepEqual(edited.exercises.map((e: any) => e.exerciseId), [global.id, custom.id]);
  const persisted = await db.routineExercise.findMany({ where: { routineId: routine.id }, orderBy: { order: 'asc' } });
  assert.deepEqual(persisted.map(e => [e.order, e.restTime, e.notes]), [[0, 120, 'Primeiro'], [1, 90, 'Segundo']]);

  // Force a DB error after deleteMany to prove the complete replacement rolls back.
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_builder_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.notes = 'FAIL_AFTER_DELETE' THEN RAISE EXCEPTION 'Test failure after deletion' USING ERRCODE='23514'; END IF;
    RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER builder_test_failure BEFORE INSERT ON routine_exercises FOR EACH ROW EXECUTE FUNCTION fail_builder_test_insert()`);
  await req('PATCH', `/routines/${routine.id}`, { name: 'Não pode persistir', exercises: [exercise(global.id, 0, 'FAIL_AFTER_DELETE', 30)] }, 500);
  assert.deepEqual(await req('GET', `/routines/${routine.id}`), edited);
  await db.$executeRawUnsafe('DROP TRIGGER builder_test_failure ON routine_exercises');
  await db.$executeRawUnsafe('DROP FUNCTION fail_builder_test_insert()');
  console.log('PASS Routine API: CRUD, ordem/repetições, notes/restTime, JWT/ownership/404, validação e rollback após remoção da lista.');

  const plan = await req('POST', '/plans', { name: 'Minha semana', source: 'CUSTOM', days: [
    { dayOfWeek: 'MONDAY', routineId: routine.id }, { dayOfWeek: 'FRIDAY', routineId: routine.id },
  ] }, 201);
  assert.equal(plan.days[0].routine.exerciseCount, 2);
  const session = await req('POST', '/sessions', { routineId: routine.id }, 201);
  assert.equal(session.name, 'Final');
  assert.deepEqual(session.exercises.map((e: any) => [e.exerciseId, e.order, e.notes, e.restTimeSnapshot, e.exerciseNameSnapshot]), [
    [global.id, 0, 'Primeiro', 120, 'Supino'], [custom.id, 1, 'Segundo', 90, 'Inclinado'],
  ]);
  assert.deepEqual(session.exercises.map((e: any) => e.sets), [[], []]);
  const withSet = await req('POST', `/sessions/${session.id}/exercises/${session.exercises[0].id}/sets`, {}, 201);
  assert.equal(withSet.exercises[0].sets[0].restTime, 0, 'WorkoutSet default must not consume planned rest');
  const withExplicit = await req('POST', `/sessions/${session.id}/exercises/${session.exercises[1].id}/sets`, { restTime: 45 }, 201);
  assert.equal(withExplicit.exercises[1].sets[0].restTime, 45);
  await req('PATCH', `/routines/${routine.id}`, { name: 'Mudou', exercises: [exercise(custom.id, 0, 'Outra nota', 30)] });
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), withExplicit);
  const closed = await req('POST', `/sessions/${session.id}/finish`, {});
  await req('PATCH', `/routines/${routine.id}`, { exercises: [] });
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), closed);
  const sqlFails = async (query: Prisma.Sql) => assert.rejects(db.$executeRaw(query), (error: any) => {
    assert.equal(error.code, 'P2010'); assert.equal(error.meta?.code, '23514'); return true;
  });
  await sqlFails(Prisma.sql`UPDATE workout_exercises SET "restTimeSnapshot"=30 WHERE id=${session.exercises[0].id}`);
  await sqlFails(Prisma.sql`INSERT INTO routine_exercises (id,"routineId","exerciseId","restTime","updatedAt") VALUES (${randomUUID()},${routine.id},${global.id},-1,now())`);
  await req('DELETE', `/routines/${routine.id}`, undefined, 204);
  await req('GET', `/routines/${routine.id}`, undefined, 404);
  assert.deepEqual((await req('GET', `/plans/${plan.id}`)).days, []);
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), { ...closed, routineId: null });
  assert.equal(await db.weeklyTrainingDay.count({ where: { routineId: routine.id } }), 0);
  const withoutRest = await req('POST', '/routines', { name: 'Opcional', exercises: [{ exerciseId: global.id, order: 0 }] }, 201);
  assert.equal(withoutRest.exercises[0].restTime, null);
  const optionalSession = await req('POST', '/sessions', { routineId: withoutRest.id }, 201);
  assert.equal(optionalSession.exercises[0].restTimeSnapshot, null);
  await req('POST', `/sessions/${optionalSession.id}/discard`, {});
  // Concurrent updates remain whole; start observes a complete old or new version.
  const concurrent = await Promise.all([
    req('PATCH', `/routines/${withoutRest.id}`, { name: 'Concurrent', exercises: [exercise(custom.id, 0, 'Nova', 75), exercise(global.id, 1, null, 0)] }),
    req('POST', '/sessions', { routineId: withoutRest.id }, 201),
  ]);
  const started = concurrent[1];
  if (started.name === 'Concurrent') assert.deepEqual(started.exercises.map((e: any) => e.restTimeSnapshot), [75, 0]);
  else { assert.equal(started.name, 'Opcional'); assert.deepEqual(started.exercises.map((e: any) => e.restTimeSnapshot), [null]); }
  console.log('PASS integração: Weekly Plan imediato, start ordenado, snapshots independentes, descanso opcional, WorkoutSet inalterado, delete/histórico e edição concorrente com start.');
} finally { await app.close(); await db.$disconnect(); await database.cleanup(); }
