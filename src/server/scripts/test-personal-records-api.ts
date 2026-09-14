import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  const owner = await db.user.create({ data: { email: 'pr-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'pr-other@example.test' } });
  const exercises = await Promise.all([0, 1, 2].map(index => db.exercise.create({ data: {
    origin: 'GLOBAL', slug: `pr-${index}`, name: 'Mesmo nome', primaryMuscle: 'CHEST', equipment: 'BARBELL',
    measurementType: index === 2 ? 'TIME' : 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST',
    movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Controle o movimento.',
  } })));
  const auth = app.jwt.sign({ id: owner.id, scope: 'session' });
  async function call(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', payload?: object, status = 200, token = auth) {
    const response = await app.inject({ url: `/api/workouts/sessions${path}`, method, payload, headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, status, response.body); return response.json();
  }
  const start = async (exerciseId = exercises[0].id) => {
    const session = await call('', 'POST', { name: 'PR atual' }, 201);
    return call(`/${session.id}/exercises`, 'POST', { exerciseId }, 201);
  };
  const pathFor = (session: any, setId?: string, exerciseIndex = 0) => `/${session.id}/exercises/${session.exercises[exerciseIndex].id}/sets${setId ? `/${setId}` : ''}`;
  const add = async (session: any, weight: number, reps = 1, type = 'WORKING', exerciseIndex = 0) => {
    const result = await call(pathFor(session, undefined, exerciseIndex), 'POST', type === 'DROP_SET' ? { type } : { type, weight, reps }, 201);
    const set = result.exercises[exerciseIndex].sets.at(-1);
    if (type === 'DROP_SET') for (const order of [0, 1]) await call(`${pathFor(session, set.id, exerciseIndex)}/segments`, 'POST', { weight: weight - order, reps }, 201);
    return set;
  };
  const complete = (session: any, set: any, completed = true, exerciseIndex = 0) => call(`${pathFor(session, set.id, exerciseIndex)}/completion`, 'PATCH', { completed });
  const records = (session: any) => call(`/${session.id}/personal-records`);
  const finish = (session: any) => call(`/${session.id}/finish`, 'POST');
  const historical = async (weight: number, options: { userId?: string; exerciseId?: string; status?: 'COMPLETED' | 'DISCARDED' | 'ACTIVE'; endedAt?: string; reps?: number; type?: 'WORKING' | 'WARMUP'; incomplete?: boolean } = {}) => {
    const session = await db.workoutSession.create({ data: {
      userId: options.userId ?? owner.id, name: 'Histórico', startedAt: new Date('2020-01-01'),
      exercises: { create: { exerciseId: options.exerciseId ?? exercises[0].id, order: 0, sets: { create: {
        setNumber: 1, weight, reps: options.reps ?? 1, type: options.type ?? 'WORKING', completedAt: options.incomplete ? null : new Date('2020-01-01T01:00:00Z'),
      } } } },
    } });
    if (options.status !== 'ACTIVE') await db.workoutSession.update({ where: { id: session.id }, data: {
      status: options.status ?? 'COMPLETED', endedAt: new Date(options.endedAt ?? '2020-01-02'),
    } });
    return session;
  };

  // First session remains silent even after multiple completed, improving sets.
  const first = await start();
  for (const weight of [90, 100]) assert.equal((await complete(first, await add(first, weight))).achievement, null);
  assert.deepEqual(await records(first), { items: [] });
  await finish(first);
  assert.deepEqual(await records(first), { items: [] });

  // More recent, weaker execution must not replace the best history.
  const weaker = await start();
  assert.equal((await complete(weaker, await add(weaker, 80))).achievement, null);
  await finish(weaker);
  await historical(900, { status: 'DISCARDED' });
  await historical(900, { userId: other.id });
  await historical(900, { exerciseId: exercises[1].id });
  await historical(900, { type: 'WARMUP' });
  await historical(900, { reps: 13 });
  await historical(900, { incomplete: true });
  await historical(900, { endedAt: '2099-01-01' });
  const second = await start();
  for (const [weight, reps, type] of [[99, 1, 'WORKING'], [100, 1, 'WORKING'], [900, 1, 'WARMUP'], [900, 1, 'DROP_SET'], [900, 13, 'WORKING'], [0, 1, 'WORKING']] as const) {
    assert.equal((await complete(second, await add(second, weight, reps, type))).achievement, null);
  }
  await add(second, 900); // incomplete current set must not enter running best
  const achievements: any[] = [];
  for (const [weight, expected] of [[105, true], [103, false], [110, true]] as const) {
    const set = await add(second, weight);
    const response = await complete(second, set);
    assert.equal(response.id, second.id);
    assert.equal(response.status, 'ACTIVE');
    if (expected) {
      assert.deepEqual(response.achievement, { type: 'ESTIMATED_1RM_PR', workoutSetId: set.id, exerciseId: exercises[0].id,
        previousValue: achievements.length ? 105 : 100, currentValue: weight });
      achievements.push(response.achievement);
    } else assert.equal(response.achievement, null);
  }
  assert.deepEqual((await records(second)).items, achievements);
  const twelve = await add(second, 80, 12);
  const twelvePR = (await complete(second, twelve)).achievement;
  assert.equal(twelvePR.currentValue, 112);
  assert.equal(twelvePR.previousValue, 110);
  assert.equal((await complete(second, twelve)).achievement, null); // idempotent completion
  assert.equal((await complete(second, twelve, false)).achievement, null);
  assert.deepEqual((await records(second)).items, achievements);
  assert.deepEqual((await complete(second, twelve)).achievement, twelvePR);
  await complete(second, twelve, false);
  await call(pathFor(second, twelve.id), 'PATCH', { weight: 70 });
  assert.equal((await complete(second, twelve)).achievement, null);
  // Editing/deleting earlier PRs changes derived subsequent achievements.
  await call(pathFor(second, achievements[0].workoutSetId), 'PATCH', { weight: 101 });
  assert.deepEqual((await records(second)).items.map((item: any) => item.currentValue), [101, 103, 110]);
  await call(pathFor(second, achievements[0].workoutSetId), 'DELETE');
  assert.deepEqual((await records(second)).items.map((item: any) => item.currentValue), [103, 110]);

  // Concurrent completion must agree exactly with replay order and benchmark.
  const a = await add(second, 120), b = await add(second, 125);
  const results = await Promise.all([complete(second, a), complete(second, b)]);
  const concurrent = (await records(second)).items.filter((item: any) => [a.id, b.id].includes(item.workoutSetId));
  assert.deepEqual(results.flatMap(item => item.achievement ? [item.achievement] : []).sort((x, y) => x.currentValue - y.currentValue), concurrent);
  const completedSets = results.at(-1).exercises[0].sets.filter((set: any) => [a.id, b.id].includes(set.id) && set.completedAt);
  if (completedSets.length === 2) assert.notEqual(completedSets[0].completedAt, completedSets[1].completedAt);
  assert.equal(concurrent.at(-1).currentValue, 125);
  // Duplicate occurrences share exerciseId running best.
  const duplicate = await call(`/${second.id}/exercises`, 'POST', { exerciseId: exercises[0].id }, 201);
  assert.equal((await complete(duplicate, await add(duplicate, 124, 1, 'WORKING', 1), true, 1)).achievement, null);
  assert.equal((await complete(duplicate, await add(duplicate, 130, 1, 'WORKING', 1), true, 1)).achievement.previousValue, 125);

  const foreignAuth = app.jwt.sign({ id: other.id, scope: 'session' });
  await call(`/${second.id}/personal-records`, 'GET', undefined, 404, foreignAuth);
  await call(`${pathFor(second, a.id)}/completion`, 'PATCH', { completed: true }, 404, foreignAuth);
  await call(`/${randomUUID()}/personal-records`, 'GET', undefined, 404);
  await call('/invalid/personal-records', 'GET', undefined, 400);
  await call(`/${second.id}/personal-records`, 'GET', undefined, 401, 'invalid');
  await call(`/${second.id}/personal-records`, 'GET', undefined, 403, app.jwt.sign({ id: owner.id, scope: 'reset_password' }));
  const beforeFinish = await records(second);
  await finish(second);
  assert.deepEqual(await records(second), beforeFinish);
  // Same-user historical ACTIVE is possible while replaying a completed target.
  const active = await historical(900, { status: 'ACTIVE' });
  assert.deepEqual(await records(second), beforeFinish);
  await call(`/${active.id}/discard`, 'POST');
  // Exact temporal boundary is excluded, not <=.
  await historical(900, { endedAt: second.startedAt });
  assert.deepEqual(await records(second), beforeFinish);
  // A different exercise's historical record cannot supply a first baseline.
  const newUser = await db.user.create({ data: { email: 'pr-fresh@example.test' } });
  await historical(100, { userId: newUser.id });
  const fresh = await db.workoutSession.create({ data: { userId: newUser.id, name: 'Sem baseline', exercises: { create: {
    exerciseId: exercises[1].id, order: 0, sets: { create: { setNumber: 1, weight: 200, reps: 1, completedAt: new Date() } },
  } } } });
  assert.deepEqual(await call(`/${fresh.id}/personal-records`, 'GET', undefined, 200, app.jwt.sign({ id: newUser.id, scope: 'session' })), { items: [] });
  // Snapshot eligibility is independent from catalog edits.
  await historical(900, { exerciseId: exercises[2].id });
  await db.exercise.update({ where: { id: exercises[2].id }, data: { measurementType: 'WEIGHT_REPS' } });
  const changed = await start(exercises[2].id);
  assert.equal((await complete(changed, await add(changed, 1000))).achievement, null);
  console.log('PASS baseline, exclusions, running best, completion/reopen/edit/delete, concurrency, ownership and deterministic reconstruction on ACTIVE/COMPLETED.');
} finally { await app.close(); await db.$disconnect(); await database.cleanup(); }
