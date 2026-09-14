import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { createTestDatabase, runPrisma } from './postgresql-test-db.js';

const mainUrl = process.env.DATABASE_URL!;
const main = new PrismaClient();
const beforeCatalog = await main.exercise.findMany({ orderBy: { id: 'asc' } });
const database = await createTestDatabase();
const db = new PrismaClient();
const now = new Date();
const later = new Date(now.getTime() + 1000);
const sqlFails = async (query: Prisma.Sql, state = '23514') => {
  await assert.rejects(db.$executeRaw(query), (error: any) => {
    assert.equal(error.code, 'P2010');
    assert.equal(error.meta?.code, state);
    return true;
  });
};
try {
  const owner = await db.user.create({ data: { email: 'workout-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'workout-other@example.test' } });
  const routine = await db.routine.create({ data: { userId: owner.id, name: 'A' } });
  const otherRoutine = await db.routine.create({ data: { userId: other.id, name: 'B' } });
  const session = await db.workoutSession.create({ data: { userId: owner.id, routineId: routine.id, name: 'Treino', startedAt: now } });
  await assert.rejects(db.workoutSession.create({ data: { userId: owner.id, name: 'Duplicada' } }), { code: 'P2002' });
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET "userId"=${other.id} WHERE id=${session.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET "routineId"=${otherRoutine.id} WHERE id=${session.id}`);
  await sqlFails(Prisma.sql`INSERT INTO workout_sessions (id,"userId","routineId",name,"updatedAt") VALUES (${randomUUID()},${other.id},${routine.id},'Invalid',now())`);
  await sqlFails(Prisma.sql`UPDATE routines SET "userId"=${other.id} WHERE id=${routine.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET "endedAt"=now() WHERE id=${session.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET status='COMPLETED' WHERE id=${session.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET status='DISCARDED',"endedAt"="startedAt"-interval '1 second' WHERE id=${session.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET status='INVALID' WHERE id=${session.id}`, '22P02');
  console.log('PASS sessão ACTIVE única, ownership Session/Routine em INSERT e UPDATE, dono imutável e status/datas consistentes.');

  const exerciseData = { origin: 'CUSTOM' as const, slug: 'test-lift', name: 'Test lift', primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS' as const, aliases: [], secondaryMuscles: [] };
  const custom = await db.exercise.create({ data: { ...exerciseData, userId: owner.id } });
  const foreign = await db.exercise.create({ data: { ...exerciseData, userId: other.id } });
  const executed = await db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: custom.id } });
  const second = await db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: custom.id, order: 1 } });
  await assert.rejects(db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: foreign.id, order: 2 } }));
  await sqlFails(Prisma.sql`UPDATE workout_exercises SET "sessionId"='missing' WHERE id=${executed.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_exercises SET "exerciseNameSnapshot"='Tampered' WHERE id=${executed.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_exercises SET "order"=-1 WHERE id=${executed.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_exercises SET "order"=0 WHERE id=${second.id}`, '23505');
  await db.exercise.update({ where: { id: custom.id }, data: { name: 'Edited catalog' } });
  assert.equal((await db.workoutExercise.findUniqueOrThrow({ where: { id: executed.id } })).exerciseNameSnapshot, 'Test lift');

  const warmup = await db.workoutSet.create({ data: { workoutExerciseId: executed.id, setNumber: 1, type: 'WARMUP', reps: 0, weight: 0, restTime: 0, completedAt: now } });
  const working = await db.workoutSet.create({ data: { workoutExerciseId: executed.id, setNumber: 2, reps: 8, weight: 34 } });
  assert.equal(working.type, 'WORKING');
  assert.equal(working.completedAt, null);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET type='INVALID' WHERE id=${working.id}`, '22P02');
  await sqlFails(Prisma.sql`UPDATE workout_sets SET reps=-1 WHERE id=${working.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET weight=-1 WHERE id=${working.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "restTime"=-1 WHERE id=${working.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "setNumber"=0 WHERE id=${working.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "setNumber"=1 WHERE id=${working.id}`, '23505');
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "workoutExerciseId"=${second.id} WHERE id=${working.id}`);
  await assert.rejects(db.workoutSet.create({ data: { workoutExerciseId: randomUUID(), setNumber: 1 } }), { code: 'P2003' });
  for (const value of ['NaN', 'Infinity', '-Infinity']) {
    await sqlFails(Prisma.sql`UPDATE workout_sets SET weight=${value}::float8 WHERE id=${working.id}`);
  }
  await db.workoutSet.update({ where: { id: working.id }, data: { completedAt: now } });
  assert.ok((await db.workoutSet.findUniqueOrThrow({ where: { id: working.id } })).completedAt);
  console.log('PASS WARMUP/WORKING persistidos; conclusão temporal; snapshots; ownership custom; posições, FKs, negativos e floats não finitos protegidos.');

  const drop = await db.workoutSet.create({ data: { workoutExerciseId: executed.id, setNumber: 3, type: 'DROP_SET' } });
  assert.equal(drop.weight, null); assert.equal(drop.reps, null);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET weight=34,reps=8 WHERE id=${drop.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "completedAt"=now() WHERE id=${drop.id}`);
  const stages = await Promise.all([[34, 8], [28, 6], [22, 5]].map(async ([weight, reps], order) =>
    db.dropSetSegment.create({ data: { workoutSetId: drop.id, order, weight, reps } })));
  const stage = stages[0];
  await sqlFails(Prisma.sql`UPDATE workout_sets SET type='WORKING' WHERE id=${drop.id}`);
  await sqlFails(Prisma.sql`UPDATE workout_sets SET "completedAt"=now() WHERE id=${drop.id}`);
  await sqlFails(Prisma.sql`INSERT INTO drop_set_segments (id,"workoutSetId","order",weight,reps) VALUES (${randomUUID()},${working.id},0,20,8)`);
  await sqlFails(Prisma.sql`INSERT INTO drop_set_segments (id,"workoutSetId","order",weight,reps) VALUES (${randomUUID()},'missing',0,20,8)`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET "workoutSetId"=${working.id} WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET "order"=-1 WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET reps=-1 WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET weight=-1 WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET "order"=1 WHERE id=${stage.id}`, '23505');
  for (const value of ['NaN', 'Infinity', '-Infinity']) {
    await sqlFails(Prisma.sql`UPDATE drop_set_segments SET weight=${value}::float8 WHERE id=${stage.id}`);
  }
  await db.$transaction(async tx => {
    // Parent-first is legal because completion validation is deferred to COMMIT.
    await tx.workoutSet.update({ where: { id: drop.id }, data: { completedAt: later } });
    await tx.dropSetSegment.updateMany({ where: { workoutSetId: drop.id }, data: { completedAt: now } });
  });
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET "completedAt"=NULL WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`UPDATE drop_set_segments SET "completedAt"=${new Date(later.getTime()+1000)} WHERE id=${stage.id}`);
  await sqlFails(Prisma.sql`DELETE FROM drop_set_segments WHERE "workoutSetId"=${drop.id}`);
  const history = await db.workoutSet.findUniqueOrThrow({ where: { id: drop.id }, include: { segments: { orderBy: { order: 'asc' } } } });
  assert.deepEqual(history.segments.map(s => [s.weight,s.reps]), [[34,8],[28,6],[22,5]]);
  assert.equal(await db.workoutSet.count({ where: { workoutExerciseId: executed.id } }), 3);
  assert.equal(await db.workoutSet.count({ where: { id: warmup.id, type: 'WARMUP' } }), 1);
  console.log('PASS DROP_SET: 34×8 → 28×6 → 22×5 em uma série lógica; pai sem carga/reps; conclusão atômica e segmentos consistentes no COMMIT.');

  // Race: deleting two different segments from a completed 3-stage drop must
  // never commit both and leave a completed one-stage drop.
  const deletes = await Promise.allSettled(stages.slice(0,2).map(s => db.dropSetSegment.delete({ where: { id: s.id } })));
  assert.equal(deletes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.dropSetSegment.count({ where: { workoutSetId: drop.id } }), 2);
  // Repeatable Read keeps an old snapshot: a row lock alone must not allow
  // disjoint segment writes to both validate against the old three-stage drop.
  const repeatableDrop = await db.workoutSet.create({ data: {
    workoutExerciseId: executed.id, setNumber: 4, type: 'DROP_SET', completedAt: later,
    segments: { create: [0,1,2].map(order => ({ order, weight: 20, reps: 8, completedAt: now })) },
  }, include: { segments: { orderBy: { order: 'asc' } } } });
  let arrived = 0;
  let release!: () => void;
  const bothRead = new Promise<void>(resolve => { release = resolve; });
  const repeatableDeletes = await Promise.allSettled(repeatableDrop.segments.slice(0,2).map(segment => db.$transaction(async tx => {
    await tx.dropSetSegment.count({ where: { workoutSetId: repeatableDrop.id } });
    if (++arrived === 2) release();
    await bothRead;
    await tx.dropSetSegment.delete({ where: { id: segment.id } });
  }, { isolationLevel: 'RepeatableRead', timeout: 10000 })));
  assert.equal(repeatableDeletes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((repeatableDeletes.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code, 'P2034');
  assert.equal(await db.dropSetSegment.count({ where: { workoutSetId: repeatableDrop.id } }), 2);
  // Independent clients on the same schema, concurrent inserts for the same user.
  const peer = new PrismaClient();
  try {
    const races = await Promise.allSettled([db,peer].map(client => client.workoutSession.create({ data: { userId: other.id, name: 'Concurrent' } })));
    assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
    const failed = races.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failed.reason.code, 'P2002');
  } finally { await peer.$disconnect(); }
  console.log('PASS concorrência: apenas um ACTIVE por usuário; DROP_SET protegido em Read Committed e Repeatable Read (conflito P2034).');

  // Nullable simple-set metrics do not force TIME/REPS_ONLY into weight × reps.
  for (const measurementType of ['TIME','REPS_ONLY','DISTANCE_TIME'] as const) {
    const ex = await db.exercise.create({ data: { ...exerciseData, userId: owner.id, slug: measurementType.toLowerCase().replaceAll('_','-'), measurementType } });
    const we = await db.workoutExercise.create({ data: { exerciseId: ex.id, sessionId: session.id, order: 10 + ['TIME','REPS_ONLY','DISTANCE_TIME'].indexOf(measurementType) } });
    await db.workoutSet.create({ data: { workoutExerciseId: we.id, setNumber: 1, completedAt: now } });
  }
  await db.workoutSession.update({ where: { id: session.id }, data: { status: 'COMPLETED', endedAt: later } });
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET status='ACTIVE',"endedAt"=NULL WHERE id=${session.id}`);
  const discarded = await db.workoutSession.create({ data: { userId: owner.id, name: 'Descartar', startedAt: now } });
  await db.workoutSession.update({ where: { id: discarded.id }, data: { status: 'DISCARDED', endedAt: later } });
  await sqlFails(Prisma.sql`UPDATE workout_sessions SET status='ACTIVE',"endedAt"=NULL WHERE id=${discarded.id}`);
  await db.routine.delete({ where: { id: routine.id } });
  assert.equal((await db.workoutSession.findUniqueOrThrow({ where: { id: session.id } })).routineId, null);
  await db.user.delete({ where: { id: owner.id } });
  assert.equal(await db.dropSetSegment.count(), 0);
  assert.equal(await db.workoutSet.count(), 0);
  assert.ok(await db.exercise.findUnique({ where: { id: foreign.id } }));
  console.log('PASS outros measurementTypes aceitam métricas ausentes; COMPLETED/DISCARDED não reabrem; exclusão de rotina preserva sessão; cascades preservam outro usuário.');
} finally {
  await db.$disconnect(); await database.cleanup();
  process.env.DATABASE_URL = mainUrl;
  assert.deepEqual(await main.exercise.findMany({ orderBy: { id: 'asc' } }), beforeCatalog);
  await main.$disconnect();
}

// Prove the migration aborts on legacy data before dropping isCompleted.
const admin = new PrismaClient();
const legacySchema = `kindra_test_${randomUUID().replaceAll('-', '')}`;
await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacySchema}"`);
const legacyUrl = new URL(mainUrl); legacyUrl.searchParams.set('schema', legacySchema);
const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl.toString() } } });
try {
  process.env.DATABASE_URL = legacyUrl.toString();
  for (const migration of ['20260911172138_init_postgresql','20260911201500_activity_catalogs']) {
    runPrisma(['db','execute','--file',`prisma/migrations/${migration}/migration.sql`,'--schema','prisma/schema.prisma']);
  }
  await legacy.$executeRaw`INSERT INTO users (id,email,"updatedAt") VALUES ('legacy-user','legacy@example.test',now())`;
  await legacy.$executeRaw`INSERT INTO workout_sessions (id,"userId",name,"updatedAt") VALUES ('legacy-session','legacy-user','Legacy',now())`;
  await legacy.$executeRaw`INSERT INTO exercises (id,origin,"userId",slug,name,aliases,"primaryMuscle","secondaryMuscles",equipment,"measurementType","updatedAt") VALUES ('legacy-exercise','CUSTOM','legacy-user','legacy','Legacy',ARRAY[]::text[],'CHEST',ARRAY[]::text[],'BARBELL','WEIGHT_REPS',now())`;
  await legacy.$executeRaw`INSERT INTO workout_exercises (id,"sessionId","exerciseId","updatedAt") VALUES ('legacy-executed','legacy-session','legacy-exercise',now())`;
  await legacy.$executeRaw`INSERT INTO workout_sets (id,"workoutExerciseId","setNumber",reps,weight,"isCompleted","updatedAt") VALUES ('legacy-set','legacy-executed',1,8,34,true,now())`;
  const before = await legacy.$queryRaw`SELECT * FROM workout_sets`;
  assert.throws(() => runPrisma(['db','execute','--file','prisma/migrations/20260912181258_workout_execution_foundation/migration.sql','--schema','prisma/schema.prisma']));
  assert.deepEqual(await legacy.$queryRaw`SELECT * FROM workout_sets`, before);
  assert.deepEqual(await legacy.$queryRaw`SELECT id FROM workout_sessions`, [{ id: 'legacy-session' }]);
  console.log('PASS migration aborta com legado ambíguo; IDs, carga/reps e isCompleted preservados integralmente.');
} finally {
  await legacy.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA "${legacySchema}" CASCADE`);
  await admin.$disconnect(); process.env.DATABASE_URL = mainUrl;
}
console.log('PASS fundação Workout Live validada no PostgreSQL; catálogo local preservado.');
