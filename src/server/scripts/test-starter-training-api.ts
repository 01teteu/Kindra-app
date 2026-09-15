import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase } from './postgresql-test-db.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
try {
  const user = async (name: string, profile = true) => db.user.create({ data: { email: `${name}@example.test`,
    ...(profile ? { profile: { create: { firstName: 'Teste', lastName: 'Plano', birthDate: new Date('1990-01-01'),
      weightKg: 70, heightCm: 170, activityLevel: 'Moderado', goal: 'Manutencao' } } } : {}) } });
  const a = await user('starter-a'); const b = await user('starter-b');
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const raw = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, payload?: object, auth = token(a.id)) =>
    app.inject({ method, url: `/api/workouts${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
  const req = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, payload?: object, status = 200, auth = token(a.id)) => {
    const result = await raw(method, path, payload, auth);
    assert.equal(result.statusCode, status, `${path}: ${result.body}`); return result.json();
  };
  const catalog = JSON.parse(readFileSync('prisma/seed-data/exercises.json', 'utf8'));
  await db.exercise.createMany({ data: catalog.map(({ media, ...row }: any) => ({ ...row, ...media, origin: 'GLOBAL' })) });
  const input = { trainingDaysPerWeek: 3, equipment: ['MACHINE', 'CABLE', 'DUMBBELL'] };
  const own = await db.exercise.create({ data: { origin: 'CUSTOM', userId: a.id, slug: '000-owned-core', name: 'Abdominal próprio',
    primaryMuscle: 'CORE', movementPattern: 'TRUNK_FLEXION', equipment: 'MACHINE', laterality: 'BILATERAL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [] } });
  const foreign = await db.exercise.create({ data: { origin: 'CUSTOM', userId: b.id, slug: '000-foreign-chest', name: 'Peito privado',
    primaryMuscle: 'CHEST', movementPattern: 'HORIZONTAL_PRESS', equipment: 'MACHINE', laterality: 'BILATERAL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [] } });
  await db.exercise.create({ data: { origin: 'CUSTOM', userId: a.id, slug: '000-inactive', name: 'Inativo', isActive: false,
    primaryMuscle: 'QUADS', movementPattern: 'LEG_PRESS', equipment: 'MACHINE', laterality: 'BILATERAL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [] } });
  const counts = async () => Promise.all([db.routine.count(), db.routineExercise.count(), db.weeklyTrainingPlan.count(), db.weeklyTrainingDay.count()]);
  const empty = await counts();
  for (const body of [{}, { ...input, trainingDaysPerWeek: 5 }, { ...input, trainingDaysPerWeek: 1 },
    { ...input, equipment: [] }, { ...input, equipment: ['NOPE'] }, { ...input, equipment: ['CABLE', 'CABLE'] },
    { ...input, userId: b.id }, { ...input, exerciseId: foreign.id }, { ...input, isActive: true }])
    await req('POST', '/plans/generate', body, 400);
  await req('POST', '/plans/generate', input, 401, 'invalid');
  await req('POST', '/plans/generate', input, 403, token(a.id, 'reset_password'));
  assert.deepEqual(await counts(), empty);
  const missing = await user('starter-no-profile', false);
  await req('POST', '/plans/generate', input, 409, token(missing.id));
  const limitation = await db.physicalLimitation.create({ data: { name: 'Limitação cadastrada', isCustom: true } });
  await db.profile.update({ where: { userId: b.id }, data: { physicalLimitations: { create: { physicalLimitationId: limitation.id } } } });
  const blocked = await req('POST', '/plans/generate', input, 422, token(b.id));
  assert.match(blocked.error, /limitações físicas cadastradas/);
  assert.deepEqual(await counts(), empty);
  // Manual creation remains available even with registered limitations.
  await req('POST', '/plans', { name: 'Manual', source: 'CUSTOM' }, 201, token(b.id));
  const plan = await req('POST', '/plans/generate', input, 201);
  assert.equal(plan.source, 'GENERATED'); assert.equal(plan.isActive, true);
  assert.deepEqual(plan.days.map((day: any) => day.dayOfWeek), ['MONDAY', 'WEDNESDAY', 'FRIDAY']);
  assert.equal(plan.days[0].routineId, plan.days[2].routineId);
  const routines = await db.routine.findMany({ where: { userId: a.id }, include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } } });
  assert.equal(routines.length, 2);
  for (const routine of routines) {
    assert.equal(routine.userId, a.id); assert.equal(routine.exercises.length, 6);
    assert.ok(routine.exercises.some(ex => ex.exerciseId === own.id));
    assert.deepEqual(routine.exercises.map(ex => ex.order), [0, 1, 2, 3, 4, 5]);
    for (const ex of routine.exercises) {
      assert.equal(ex.notes, null); assert.equal(ex.restTime, null); assert.equal(ex.exercise.isActive, true);
      assert.equal(ex.exercise.measurementType, 'WEIGHT_REPS'); assert.ok(input.equipment.includes(ex.exercise.equipment));
      assert.notEqual(ex.exerciseId, foreign.id);
      assert.ok(ex.exercise.origin === 'GLOBAL' ? ex.exercise.userId === null : ex.exercise.userId === a.id);
    }
  }
  assert.equal((await db.weeklyTrainingPlan.findUniqueOrThrow({ where: { id: plan.id } })).userId, a.id);
  assert.deepEqual(await req('GET', `/plans/${plan.id}`), plan);
  assert.deepEqual(await req('GET', '/plans/active'), plan);
  assert.ok((await req('GET', '/plans')).some((row: any) => row.id === plan.id));
  const summary = await req('GET', '/routines?summary=true');
  assert.equal(summary.length, 2); assert.ok(summary.every((r: any) => r.exerciseCount === 6));
  const another = await req('POST', '/plans/generate', { ...input, trainingDaysPerWeek: 4 }, 201);
  assert.equal(another.isActive, false); assert.equal(another.days.length, 4);
  assert.deepEqual(await req('GET', `/plans/${plan.id}`), plan);
  assert.ok(another.days.every((day: any) => !routines.some(row => row.id === day.routineId)));
  await req('POST', `/plans/${another.id}/activate`, {});
  assert.equal((await req('GET', '/plans/active')).id, another.id);
  const routineId = plan.days[0].routineId;
  for (const [path, invalid] of [[`/plans/${plan.id}`, `/plans/${randomUUID()}`], [`/routines/${routineId}`, `/routines/${randomUUID()}`]]) {
    assert.deepEqual(await req('GET', path, undefined, 404, token(b.id)), await req('GET', invalid, undefined, 404, token(b.id)));
  }
  await req('POST', '/sessions', { routineId }, 404, token(b.id));
  await req('PUT', `/plans/${plan.id}/days/TUESDAY`, { routineId }, 404, token(b.id));
  const foreignRoutine = await db.routine.create({ data: { userId: b.id, name: 'Privada' } });
  await req('PUT', `/plans/${plan.id}/days/TUESDAY`, { routineId: foreignRoutine.id }, 404);
  await assert.rejects(db.weeklyTrainingDay.create({ data: { planId: plan.id, routineId: foreignRoutine.id, dayOfWeek: 'TUESDAY' } }));
  const before = await req('GET', `/routines/${routineId}`);
  const session = await req('POST', '/sessions', { routineId }, 201);
  assert.equal(session.exercises.length, before.exercises.length);
  for (let index = 0; index < session.exercises.length; index++) {
    const snapshot = session.exercises[index]; const planned = before.exercises[index];
    assert.equal(snapshot.exerciseId, planned.exerciseId); assert.equal(snapshot.order, planned.order);
    assert.equal(snapshot.exerciseNameSnapshot, planned.exercise.name);
    assert.equal(snapshot.primaryMuscleSnapshot, planned.exercise.primaryMuscle);
    assert.equal(snapshot.equipmentSnapshot, planned.exercise.equipment);
    assert.equal(snapshot.measurementTypeSnapshot, planned.exercise.measurementType);
    assert.equal(snapshot.notes, null); assert.equal(snapshot.restTimeSnapshot, null);
  }
  const completed = await req('POST', `/sessions/${session.id}/finish`, {});
  await req('PATCH', `/plans/${plan.id}`, { name: 'Minha edição' });
  await req('PUT', `/plans/${plan.id}/days/MONDAY`, { routineId: plan.days[1].routineId });
  const edited = await req('PATCH', `/routines/${routineId}`, { name: 'Rotina editada', exercises: before.exercises.slice(1).reverse().map((ex: any, order: number) => ({ exerciseId: ex.exerciseId, order, notes: 'Minha nota', restTime: 75 })) });
  assert.equal(edited.name, 'Rotina editada'); assert.equal(edited.exercises.length, 5);
  assert.deepEqual(await req('GET', `/sessions/${session.id}`), completed);
  await req('POST', '/plans/generate', input, 201);
  assert.deepEqual(await req('GET', `/routines/${routineId}`), edited);
  assert.equal((await req('GET', `/plans/${plan.id}`)).name, 'Minha edição');
  // Fail the final day insertion, after routines, exercises and the plan exist
  // inside the transaction; no test failpoint enters production code.
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_starter_day() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."dayOfWeek" = 'FRIDAY' THEN
      IF (SELECT count(*) FROM routines WHERE "userId" = (SELECT "userId" FROM weekly_training_plans WHERE id = NEW."planId")) < 4
      THEN RAISE EXCEPTION 'Test precondition failed'; END IF;
      RAISE EXCEPTION 'Forced intermediate failure' USING ERRCODE = '23514';
    END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER fail_starter_day BEFORE INSERT ON weekly_training_days FOR EACH ROW EXECUTE FUNCTION fail_starter_day()');
  const rollbackUser = await user('starter-rollback');
  const baseline = await counts();
  await req('POST', '/plans/generate', { ...input, trainingDaysPerWeek: 4 }, 500, token(rollbackUser.id));
  assert.deepEqual(await counts(), baseline);
  await db.$executeRawUnsafe('DROP TRIGGER fail_starter_day ON weekly_training_days');
  await db.$executeRawUnsafe('DROP FUNCTION fail_starter_day()');
  const insufficient = await req('POST', '/plans/generate', { ...input, equipment: ['RINGS'] }, 422);
  assert.match(insufficient.error, /Catálogo insuficiente/); assert.deepEqual(await counts(), baseline);
  // Two independent generations create two complete plans, with one active.
  const concurrentUser = await user('starter-concurrent');
  const concurrent = await Promise.all([1, 2].map(() => req('POST', '/plans/generate', input, 201, token(concurrentUser.id))));
  assert.equal(concurrent.filter(plan => plan.isActive).length, 1);
  assert.equal(await db.routine.count({ where: { userId: concurrentUser.id } }), 4);
  assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: concurrentUser.id, isActive: true } }), 1);
  // A foreign private exercise cannot fill a missing global slot.
  await db.exercise.updateMany({ where: { origin: 'GLOBAL', primaryMuscle: 'CHEST' }, data: { isActive: false } });
  const unavailableBaseline = await counts();
  await req('POST', '/plans/generate', input, 422);
  assert.deepEqual(await counts(), unavailableBaseline);
  console.log('PASS PostgreSQL/API: geração real, source, perfil/limitações, validação/JWT, ownership, catálogo privado/inativo, ativação, concorrência, rollback intermediário, edição e snapshots históricos.');
} finally { await app.close(); await db.$disconnect(); await database.cleanup(); }
