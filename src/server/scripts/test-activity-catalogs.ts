import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase, runPrisma } from './postgresql-test-db.js';
import { loadActivityCatalogs, validateActivityCatalogs } from '../../../prisma/activity-validation.js';
import { seedActivityCatalogs } from '../../../prisma/activity-seed.js';

const mainUrl = process.env.DATABASE_URL!;
const main = new PrismaClient();
const mainFoods = await main.food.findMany({ orderBy: { id: 'asc' } });
const mainUsers = await main.user.count();
// Exercise the actual legacy guard against a separate schema built from the baseline.
const legacySchema = `kindra_test_${randomUUID().replaceAll('-', '')}`;
await main.$executeRawUnsafe(`CREATE SCHEMA "${legacySchema}"`);
const legacyUrl = new URL(mainUrl); legacyUrl.searchParams.set('schema', legacySchema);
const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl.toString() } } });
try {
  process.env.DATABASE_URL = legacyUrl.toString();
  runPrisma(['db', 'execute', '--file', 'prisma/migrations/20260911172138_init_postgresql/migration.sql', '--schema', 'prisma/schema.prisma']);
  await legacy.$executeRaw`INSERT INTO exercises (id, name, "targetMuscle", equipment, "updatedAt") VALUES ('legacy-id', 'Ambiguous exercise', 'Pernas', 'Máquina', now())`;
  assert.throws(() => runPrisma(['db', 'execute', '--file', 'prisma/migrations/20260911201500_activity_catalogs/migration.sql', '--schema', 'prisma/schema.prisma']));
  assert.deepEqual(await legacy.$queryRaw`SELECT id, "targetMuscle" FROM exercises`, [{ id: 'legacy-id', targetMuscle: 'Pernas' }]);
  console.log('PASS migration com legado ambíguo aborta antes de alterar dados/colunas; ID original preservado.');
} finally {
  await legacy.$disconnect();
  await main.$executeRawUnsafe(`DROP SCHEMA "${legacySchema}" CASCADE`);
  process.env.DATABASE_URL = mainUrl;
}
const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
const source = loadActivityCatalogs();
async function snapshot() {
  return {
    exercises: await db.exercise.findMany({ orderBy: { id: 'asc' } }),
    cardio: await db.cardioActivity.findMany({ orderBy: { id: 'asc' } }),
    sports: await db.sport.findMany({ orderBy: { id: 'asc' } }),
    profiles: await db.energyProfile.findMany({ orderBy: { id: 'asc' } }),
  };
}
try {
  console.log(runPrisma(['db', 'seed']).split('Catálogos de atividades:')[1]?.split('Seed de alimentos')[0]);
  const first = await snapshot();
  assert.deepEqual(Object.values(first).map(x => x.length), [415, 26, 42, 69]);
  runPrisma(['db', 'seed']);
  assert.deepEqual(await snapshot(), first);
  console.log('PASS migrations + seed completo duas vezes: 415/26/42/69; IDs, valores e timestamps idênticos.');

  for (const mutate of [
    (x: typeof source) => { x.exercises.push(x.exercises[0]); },
    (x: typeof source) => { x.cardio[0].energyProfileSlug = 'missing'; },
    (x: typeof source) => { x.sports[0].energyProfileSlug = 'strength-training'; },
    (x: typeof source) => { x.profiles[0].met.LIGHT = 0; },
    (x: typeof source) => { x.profiles[0].met.LIGHT = 100; },
    (x: typeof source) => { x.exercises[0].name = ''; },
  ]) {
    const input = structuredClone(source); mutate(input);
    await assert.rejects(seedActivityCatalogs(db, input));
    assert.deepEqual(await snapshot(), first);
  }
  const invalid = structuredClone(source);
  Reflect.set(invalid.exercises[0], 'laterality', 'INVALID');
  assert.throws(() => validateActivityCatalogs(invalid));
  Reflect.deleteProperty(invalid.cardio[0].supportedMetrics, 'duration');
  assert.throws(() => validateActivityCatalogs(invalid));
  console.log('PASS JSON inválido, duplicatas, enums, campos obrigatórios, MET e referências/domínios: erro antes de qualquer escrita.');

  const owner = await db.user.create({ data: { email: 'activity-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'activity-other@example.test' } });
  const global = first.exercises[0];
  const customData = { origin: 'CUSTOM' as const, slug: global.slug, name: global.name, primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS' as const, aliases: [], secondaryMuscles: [] };
  const custom = await db.exercise.create({ data: { ...customData, userId: owner.id } });
  const customOther = await db.exercise.create({ data: { ...customData, userId: other.id } });
  await assert.rejects(db.exercise.create({ data: { ...customData, userId: owner.id } }), { code: 'P2002' });
  const { id, createdAt, updatedAt, ...globalData } = global;
  await assert.rejects(db.exercise.create({ data: globalData }), { code: 'P2002' });
  await assert.rejects(db.exercise.create({ data: { ...customData, userId: null } }));
  await assert.rejects(db.exercise.create({ data: { ...globalData, slug: 'bad-global-owner', userId: owner.id } }));
  await assert.rejects(db.exercise.update({ where: { id: custom.id }, data: { userId: other.id } }));
  await assert.rejects(db.exercise.create({ data: { ...customData, userId: owner.id, slug: 'INVALID SLUG' } }));

  const token = app.jwt.sign({ id: owner.id, scope: 'session' });
  const headers = { authorization: `Bearer ${token}` };
  const response = await app.inject({ url: '/api/workouts/exercises', headers });
  assert.equal(response.statusCode, 200);
  const listed = response.json();
  assert.ok(listed.some(x => x.id === custom.id));
  assert.ok(!listed.some(x => x.id === customOther.id));
  for (const auth of ['', 'invalid', app.jwt.sign({ id: owner.id, scope: 'session' }, { expiresIn: -1 })]) {
    assert.equal((await app.inject({ url: '/api/workouts/exercises', headers: { authorization: `Bearer ${auth}` } })).statusCode, 401);
  }
  for (const scope of ['pending_verification', 'reset_password']) {
    assert.equal((await app.inject({ url: '/api/workouts/exercises', headers: { authorization: `Bearer ${app.jwt.sign({ id: owner.id, scope })}` } })).statusCode, 403);
  }
  const payload = { name: 'Rotina real de teste', exercises: [{ exerciseId: global.id, order: 0 }, { exerciseId: custom.id, order: 1 }] };
  const created = await app.inject({ method: 'POST', url: '/api/workouts/routines', headers, payload });
  assert.equal(created.statusCode, 201);
  const routine = created.json();
  for (const exerciseId of [customOther.id, randomUUID()]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/workouts/routines', headers, payload: { ...payload, exercises: [{ exerciseId, order: 0 }] } })).statusCode, 400);
  }
  console.log('PASS globais únicos; custom equivalentes por usuário; ownership obrigatório/imutável; acesso HTTP e JWT preservados.');

  const session = await db.workoutSession.create({ data: { name: routine.name, userId: owner.id, routineId: routine.id } });
  const executed = await db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: global.id } });
  const executedCustom = await db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: custom.id, order: 1 } });
  const set = await db.workoutSet.create({ data: { workoutExerciseId: executed.id, setNumber: 1, reps: 12, weight: 20, completedAt: new Date() } });
  await db.workoutSession.update({ where: { id: session.id }, data: { status: 'COMPLETED', endedAt: new Date() } });
  await assert.rejects(db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: customOther.id } }));
  assert.equal(executed.exerciseNameSnapshot, global.name);
  await db.routine.update({ where: { id: routine.id }, data: { name: 'Rotina alterada' } });
  await db.routineExercise.update({ where: { id: routine.exercises[0].id }, data: { notes: 'Nota alterada', order: 5 } });
  assert.deepEqual(await db.workoutExercise.findUniqueOrThrow({ where: { id: executed.id } }), executed);
  const changedSource = structuredClone(source);
  const target = changedSource.exercises.find(x => x.slug === global.slug)!;
  target.name = 'Nome revisado do catálogo';
  const changedResult = await seedActivityCatalogs(db, changedSource);
  assert.equal(changedResult.exercises.updated, 1);
  assert.equal((await db.exercise.findFirstOrThrow({ where: { origin: 'GLOBAL', slug: global.slug } })).id, global.id);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: custom.id } }), custom);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: customOther.id } }), customOther);
  assert.deepEqual(await db.workoutExercise.findUniqueOrThrow({ where: { id: executed.id } }), executed);
  assert.deepEqual(await db.workoutSet.findUniqueOrThrow({ where: { id: set.id } }), set);
  await assert.rejects(db.workoutExercise.update({ where: { id: executed.id }, data: { exerciseNameSnapshot: 'Alterado' } }));
  await assert.rejects(db.exercise.delete({ where: { id: global.id } }));
  await assert.rejects(db.exercise.delete({ where: { id: custom.id } }));
  await db.exercise.update({ where: { id: custom.id }, data: { isActive: false } });
  const archivedCustom = await db.exercise.findUniqueOrThrow({ where: { id: custom.id } });
  const reduced = structuredClone(source); reduced.exercises = reduced.exercises.filter(x => x.slug !== global.slug);
  await seedActivityCatalogs(db, reduced);
  assert.equal((await db.exercise.findUniqueOrThrow({ where: { id: global.id } })).isActive, false);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: custom.id } }), archivedCustom);
  assert.ok(await db.routineExercise.findUnique({ where: { id: routine.exercises[0].id } }));
  assert.deepEqual(await db.workoutExercise.findUniqueOrThrow({ where: { id: executedCustom.id } }), executedCustom);
  assert.equal((await app.inject({ method: 'POST', url: '/api/workouts/routines', headers, payload })).statusCode, 400);
  console.log('PASS sincronização mantém ID; rotina editada e catálogo atualizado/arquivado preservam snapshots, séries e FKs; custom arquivado intocado.');

  const cardio = first.cardio[0];
  const strength = first.profiles.find(x => x.domain === 'STRENGTH')!;
  await assert.rejects(db.cardioActivity.update({ where: { id: cardio.id }, data: { energyProfileId: strength.id } }));
  await assert.rejects(db.cardioActivity.update({ where: { id: cardio.id }, data: { energyProfileId: randomUUID() } }));
  await assert.rejects(db.sport.update({ where: { id: first.sports[0].id }, data: { energyProfileId: cardio.energyProfileId } }));
  await assert.rejects(db.energyProfile.update({ where: { id: cardio.energyProfileId }, data: { domain: 'SPORT' } }));
  await assert.rejects(db.energyProfile.delete({ where: { id: cardio.energyProfileId } }));
  await assert.rejects(db.energyProfile.update({ where: { id: strength.id }, data: { metLight: 0 } }));
  await assert.rejects(db.energyProfile.update({ where: { id: strength.id }, data: { metLight: 99 } }));
  for (const number of ['NaN', 'Infinity', '-Infinity']) {
    await assert.rejects(db.$executeRaw`UPDATE energy_profiles SET "metVigorous" = ${number}::float8 WHERE id = ${strength.id}`);
  }
  const beforeRollback = await snapshot();
  const conflict = structuredClone(source);
  conflict.profiles.find(x => x.slug === 'strength-training')!.name = 'Não deve persistir';
  const oldProfile = conflict.profiles.find(x => x.slug === source.cardio[0].energyProfileSlug)!;
  const replacement = { ...oldProfile, slug: 'replacement-cardio' };
  conflict.profiles.push(replacement);
  conflict.cardio[0].energyProfileSlug = replacement.slug;
  oldProfile.domain = 'SPORT'; // Source is internally valid; existing FK must reject and roll back.
  await assert.rejects(seedActivityCatalogs(db, conflict));
  assert.deepEqual(await snapshot(), beforeRollback);
  console.log('PASS constraints SQL: domínio nos dois sentidos, FK restrita, MET finito/positivo/ordenado e rollback integral dos quatro catálogos.');

  runPrisma(['db', 'seed']);
  runPrisma(['db', 'seed']);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: custom.id } }), archivedCustom);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: customOther.id } }), customOther);
  await Promise.all([seedActivityCatalogs(db, source), seedActivityCatalogs(db, source)]);
  assert.equal(await db.exercise.count({ where: { origin: 'GLOBAL' } }), 415);
  assert.deepEqual(await db.exercise.findUniqueOrThrow({ where: { id: custom.id } }), archivedCustom);
  await db.user.delete({ where: { id: owner.id } });
  assert.equal(await db.workoutSet.count({ where: { id: set.id } }), 0);
  assert.equal(await db.exercise.count({ where: { id: custom.id } }), 0);
  assert.ok(await db.exercise.findUnique({ where: { id: customOther.id } }));
  assert.ok(await db.exercise.findUnique({ where: { id: global.id } }));
  console.log('PASS seeds concorrentes sem duplicação; exclusão do usuário segue cascades próprios e preserva globais/outro usuário.');
} finally {
  await app.close(); await db.$disconnect(); await database.cleanup();
  assert.deepEqual(await main.food.findMany({ orderBy: { id: 'asc' } }), mainFoods);
  assert.equal(await main.user.count(), mainUsers);
  await main.$disconnect(); process.env.DATABASE_URL = mainUrl;
}
