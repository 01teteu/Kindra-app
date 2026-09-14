import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase } from './postgresql-test-db.js';
import { createWorkoutSetSchema, createDropSetSegmentSchema } from '../schemas/workout.schema.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
type SetResponse = { id: string; setNumber: number; type: string; weight: number | null; reps: number | null; restTime: number; completedAt: string | null; segments: SegmentResponse[] };
type SegmentResponse = { id: string; order: number; weight: number; reps: number; completedAt: string | null };
type SessionResponse = { exercises: { id: string; sets: SetResponse[] }[] };
try {
  const owner = await db.user.create({ data: { email: 'sets-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'sets-other@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const exerciseData = { origin: 'GLOBAL' as const, name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS' as const, aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL' as const, instructions: 'Execute com controle.' };
  const exercise = await db.exercise.create({ data: { ...exerciseData, slug: 'sets-global' } });
  const fixture = async (userId: string) => {
    const session = await db.workoutSession.create({ data: { userId, name: 'Task 1B' } });
    const executed = await db.workoutExercise.create({ data: { sessionId: session.id, exerciseId: exercise.id, order: 0 } });
    return { session, executed, base: `/sessions/${session.id}/exercises/${executed.id}/sets` };
  };
  const own = await fixture(owner.id);
  const foreign = await fixture(other.id);
  const request = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object, status = 200, auth = token(owner.id)) => {
    const result = await app.inject({ method, url: `/api/workouts${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
    assert.equal(result.statusCode, status, `${method} ${path}: ${result.body}`);
    return result.json();
  };
  const sets = (response: SessionResponse) => response.exercises.find(ex => ex.id === own.executed.id)!.sets;
  const getSet = (response: SessionResponse, id: string) => sets(response).find(set => set.id === id)!;
  const create = async (data: object) => sets(await request('POST', own.base, data, 201)).at(-1)!;
  const working = await create({ weight: 34, reps: 8, restTime: 60 });
  const warmup = await create({ type: 'WARMUP', weight: 10, reps: 12 });
  const drop = await create({ type: 'DROP_SET', restTime: 90 });
  assert.equal(working.type, 'WORKING'); assert.equal(working.setNumber, 1); assert.equal(working.completedAt, null);
  assert.equal(warmup.type, 'WARMUP'); assert.equal(warmup.restTime, 0);
  assert.equal(drop.type, 'DROP_SET'); assert.equal(drop.weight, null); assert.equal(drop.reps, null);
  assert.deepEqual(drop.segments, []);
  const wp = `${own.base}/${working.id}`;
  const dp = `${own.base}/${drop.id}`;
  const sp = `${dp}/segments`;
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(createWorkoutSetSchema.safeParse({ weight: value }).success, false);
    assert.equal(createDropSetSegmentSchema.safeParse({ weight: value, reps: 1 }).success, false);
  }
  for (const data of [{ weight: -1 }, { reps: -1 }, { reps: 1.5 }, { reps: 2147483648 }, { restTime: -1 }, { weight: '10' }, { setNumber: 3 }, { order: 0 }, { completedAt: new Date().toISOString() }, { rpe: 8 }, { type: 'INVALID' }]) {
    await request('POST', own.base, data, 400);
  }
  for (const data of [{ weight: 1 }, { reps: 1 }, { weight: null }, { reps: null }]) {
    await request('POST', own.base, { type: 'DROP_SET', ...data }, 400);
    await request('PATCH', dp, data, 400);
  }
  await request('PATCH', wp, {}, 400);
  await request('PATCH', wp, { type: 'DROP_SET' }, 409);
  await request('PATCH', dp, { type: 'WORKING' }, 409);
  await request('PATCH', dp, { type: 'WARMUP' }, 409);
  let edited = getSet(await request('PATCH', wp, { type: 'WARMUP', weight: 36, reps: 9, restTime: 45 }), working.id);
  assert.deepEqual([edited.type, edited.weight, edited.reps, edited.restTime], ['WARMUP', 36, 9, 45]);
  await request('PATCH', wp, { type: 'WORKING' });
  for (const simple of [working, warmup]) {
    await request('POST', `${own.base}/${simple.id}/segments`, { weight: 10, reps: 1 }, 400);
    const before = Date.now();
    const path = `${own.base}/${simple.id}/completion`;
    const done = getSet(await request('PATCH', path, { completed: true }), simple.id);
    assert.ok(Date.parse(done.completedAt!) >= before && Date.parse(done.completedAt!) <= Date.now());
    assert.equal(getSet(await request('PATCH', path, { completed: true }), simple.id).completedAt, done.completedAt);
    await request('PATCH', `${own.base}/${simple.id}`, { weight: null }, 400);
    assert.equal(getSet(await request('PATCH', path, { completed: false }), simple.id).completedAt, null);
    await request('PATCH', path, { completed: true, completedAt: '2020-01-01' }, 400);
  }
  const empty = await create({});
  await request('PATCH', `${own.base}/${empty.id}/completion`, { completed: true }, 400);
  await request('PATCH', `${own.base}/${empty.id}`, { weight: 0, reps: 0 });
  await request('PATCH', `${own.base}/${empty.id}/completion`, { completed: true });
  await request('PATCH', `${dp}/completion`, { completed: true }, 400);
  const segment = getSet(await request('POST', sp, { weight: 34, reps: 8 }, 201), drop.id).segments[0];
  assert.equal(segment.order, 0); assert.equal(segment.completedAt, null);
  await request('PATCH', `${dp}/completion`, { completed: true }, 400);
  for (const data of [{ weight: -1, reps: 1 }, { weight: 1, reps: -1 }, { weight: 1 }, { weight: 1, reps: 1, order: 5 }, { weight: 1, reps: 1, completedAt: null }]) {
    await request('POST', sp, data, 400);
  }
  await request('PATCH', `${sp}/${segment.id}`, {}, 400);
  edited = getSet(await request('PATCH', `${sp}/${segment.id}`, { weight: 32, reps: 7 }), drop.id);
  assert.deepEqual([edited.segments[0].weight, edited.segments[0].reps], [32, 7]);
  await request('POST', sp, { weight: 28, reps: 6 }, 201);
  await request('POST', sp, { weight: 22, reps: 5 }, 201);
  edited = getSet(await request('DELETE', `${sp}/${segment.id}`), drop.id);
  assert.deepEqual(edited.segments.map(x => x.order), [1, 2]);
  edited = getSet(await request('POST', sp, { weight: 18, reps: 4 }, 201), drop.id);
  assert.deepEqual(edited.segments.map(x => x.order), [1, 2, 3]);
  const beforeDrop = Date.now();
  const doneDrop = getSet(await request('PATCH', `${dp}/completion`, { completed: true }), drop.id);
  assert.ok(Date.parse(doneDrop.completedAt!) >= beforeDrop && Date.parse(doneDrop.completedAt!) <= Date.now());
  assert.ok(doneDrop.segments.every(x => x.completedAt === doneDrop.completedAt));
  const sid = doneDrop.segments[0].id;
  await request('POST', sp, { weight: 10, reps: 1 }, 409);
  await request('PATCH', `${sp}/${sid}`, { reps: 2 }, 409);
  await request('DELETE', `${sp}/${sid}`, undefined, 409);
  const reopened = getSet(await request('PATCH', `${dp}/completion`, { completed: false }), drop.id);
  assert.equal(reopened.completedAt, null); assert.ok(reopened.segments.every(x => x.completedAt === null));
  assert.equal((await db.workoutSet.findUniqueOrThrow({ where: { id: drop.id } })).weight, null);
  console.log('PASS tipos, métricas, edição, conversões, segmentos e conclusão/reabertura atômica.');

  const foreignSet = await db.workoutSet.create({ data: { workoutExerciseId: foreign.executed.id, setNumber: 1, type: 'DROP_SET', segments: { create: { order: 0, weight: 1, reps: 1 } } }, include: { segments: true } });
  for (const base of [foreign.base, `/sessions/${own.session.id}/exercises/${foreign.executed.id}/sets`]) {
    await request('POST', base, {}, 404);
  }
  for (const path of [`${foreign.base}/${foreignSet.id}`, `${own.base}/${foreignSet.id}`, `${own.base}/${randomUUID()}`]) {
    await request('PATCH', path, { restTime: 1 }, 404);
    await request('DELETE', path, undefined, 404);
    for (const completed of [true, false]) await request('PATCH', `${path}/completion`, { completed }, 404);
    await request('POST', `${path}/segments`, { weight: 1, reps: 1 }, 404);
    await request('PATCH', `${path}/segments/${foreignSet.segments[0].id}`, { reps: 2 }, 404);
    await request('DELETE', `${path}/segments/${foreignSet.segments[0].id}`, undefined, 404);
  }
  for (const id of [foreignSet.segments[0].id, randomUUID()]) {
    await request('PATCH', `${sp}/${id}`, { reps: 2 }, 404);
    await request('DELETE', `${sp}/${id}`, undefined, 404);
  }
  assert.equal((await db.dropSetSegment.findUniqueOrThrow({ where: { id: foreignSet.segments[0].id } })).reps, 1);
  const operations = [
    ['POST', own.base, {}], ['PATCH', wp, { restTime: 1 }], ['DELETE', wp, undefined],
    ['PATCH', `${dp}/completion`, { completed: true }], ['PATCH', `${dp}/completion`, { completed: false }],
    ['POST', sp, { weight: 1, reps: 1 }], ['PATCH', `${sp}/${sid}`, { reps: 1 }], ['DELETE', `${sp}/${sid}`, undefined],
  ] as const;
  for (const auth of ['invalid', token(owner.id, 'reset_password')]) {
    for (const [method, path, payload] of operations) await request(method, path, payload, auth === 'invalid' ? 401 : 403, auth);
  }
  for (const [index, measurementType] of (['REPS_ONLY', 'TIME', 'DISTANCE_TIME'] as const).entries()) {
    const ex = await db.exercise.create({ data: { ...exerciseData, slug: `sets-other-${index}`, measurementType } });
    const we = await db.workoutExercise.create({ data: { sessionId: own.session.id, exerciseId: ex.id, order: index + 1 } });
    const result = await request('POST', `/sessions/${own.session.id}/exercises/${we.id}/sets`, {}, 400);
    assert.match(result.error, /measurementType.*WEIGHT_REPS/);
    assert.equal(await db.workoutSet.count({ where: { workoutExerciseId: we.id } }), 0);
  }
  // Catalog changes cannot reinterpret an execution snapshot.
  await db.exercise.update({ where: { id: exercise.id }, data: { measurementType: 'TIME' } });
  await Promise.all([create({ weight: 1, reps: 1 }), create({ weight: 2, reps: 2 })]);
  await Promise.all([request('POST', sp, { weight: 5, reps: 1 }, 201), request('POST', sp, { weight: 4, reps: 1 }, 201)]);
  const active = await request('GET', '/sessions/active');
  assert.deepEqual(sets(active).map(x => x.setNumber), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(getSet(active, drop.id).segments.map(x => x.order), [1, 2, 3, 4, 5]);
  assert.equal('createdAt' in sets(active)[0], false);
  assert.equal('userId' in active, false);
  const removed = await request('DELETE', `${own.base}/${empty.id}`);
  assert.deepEqual(sets(removed).map(x => x.setNumber), [1, 2, 3, 5, 6]);
  const temporary = await create({ type: 'DROP_SET' });
  await request('POST', `${own.base}/${temporary.id}/segments`, { weight: 1, reps: 1 }, 201);
  await request('DELETE', `${own.base}/${temporary.id}`);
  assert.equal(await db.dropSetSegment.count({ where: { workoutSetId: temporary.id } }), 0);
  assert.ok(await db.workoutSet.findUnique({ where: { id: drop.id } }));
  // Completion racing a segment addition must never commit a partial DROP.
  const race = await Promise.all([
    app.inject({ method: 'PATCH', url: `/api/workouts${dp}/completion`, payload: { completed: true }, headers: { authorization: `Bearer ${token(owner.id)}` } }),
    app.inject({ method: 'POST', url: `/api/workouts${sp}`, payload: { weight: 0, reps: 0 }, headers: { authorization: `Bearer ${token(owner.id)}` } }),
  ]);
  assert.equal(race[0].statusCode, 200, race[0].body);
  assert.ok([201, 409].includes(race[1].statusCode), race[1].body);
  const persistedDrop = await db.workoutSet.findUniqueOrThrow({ where: { id: drop.id }, include: { segments: true } });
  assert.ok(persistedDrop.segments.every(x => x.completedAt?.getTime() === persistedDrop.completedAt?.getTime()));
  console.log('PASS ownership completo, JWT/escopo, measurementType snapshot, ordenação, cascades e concorrência.');

  for (const status of ['COMPLETED', 'DISCARDED'] as const) {
    const target = status === 'COMPLETED' ? own : foreign;
    const auth = token(status === 'COMPLETED' ? owner.id : other.id);
    await db.workoutSession.update({ where: { id: target.session.id }, data: { status, endedAt: new Date() } });
    for (const [method, path, payload] of operations) {
      const targetPath = status === 'COMPLETED' ? path : path.replace(own.base, foreign.base).replace(working.id, foreignSet.id).replace(drop.id, foreignSet.id).replace(sid, foreignSet.segments[0].id);
      await request(method, targetPath, payload, 409, auth);
    }
    assert.equal(await request('GET', '/sessions/active', undefined, 200, auth), null);
  }
  console.log('PASS COMPLETED/DISCARDED rejeitam todas as mutações; Task 1B validada.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
