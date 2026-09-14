import 'dotenv/config';
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
  const owner = await db.user.create({ data: { email: 'history-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'history-other@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const auth = token(owner.id);
  const request = async (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, status = 200, authorization = auth) => {
    const response = await app.inject({
      method, url: `/api/workouts${path}`, payload,
      headers: authorization ? { authorization: `Bearer ${authorization}` } : {},
    });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.json();
  };
  const get = (path: string, status = 200, authorization = auth) => request('GET', path, undefined, status, authorization);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.deepEqual(await get('/history'), { items: [], nextCursor: null });

  // Build an execution through the existing API, including incomplete work.
  const exercise = await db.exercise.create({ data: {
    origin: 'GLOBAL', slug: 'history-supino', name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST',
    movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Execute com controle.',
  } });
  const session = await request('POST', '/sessions', { name: 'Treino histórico' }, 201);
  let execution = await request('POST', `/sessions/${session.id}/exercises`, { exerciseId: exercise.id }, 201);
  const exerciseId = execution.exercises[0].id;
  const base = `/sessions/${session.id}/exercises/${exerciseId}`;
  await request('PATCH', base, { notes: 'Amplitude controlada; manter esta nota.' });
  for (const [type, weight, reps] of [['WORKING', 50, 8], ['WARMUP', 20, 12]] as const) {
    execution = await request('POST', `${base}/sets`, { type, weight, reps, restTime: 45 }, 201);
    const set = execution.exercises[0].sets.at(-1);
    execution = await request('PATCH', `${base}/sets/${set.id}/completion`, { completed: true });
  }
  execution = await request('POST', `${base}/sets`, { type: 'DROP_SET' }, 201);
  const dropId = execution.exercises[0].sets.at(-1).id;
  for (const weight of [40, 30]) await request('POST', `${base}/sets/${dropId}/segments`, { weight, reps: 6 }, 201);
  await request('PATCH', `${base}/sets/${dropId}/completion`, { completed: true });
  await request('POST', `${base}/sets`, { type: 'WORKING' }, 201);
  execution = await request('POST', `/sessions/${session.id}/exercises`, { exerciseId: exercise.id }, 201);
  assert.deepEqual(await get(`/sessions/${session.id}`), execution);
  assert.deepEqual(await get('/sessions/active'), execution);
  assert.deepEqual(await get('/history'), { items: [], nextCursor: null });
  const completed = await request('POST', `/sessions/${session.id}/finish`);
  assert.equal(completed.status, 'COMPLETED');
  assert.deepEqual(await get(`/sessions/${session.id}`), completed);
  const single = await get('/history');
  assert.deepEqual(single, { items: [{
    id: completed.id, name: completed.name, startedAt: completed.startedAt, endedAt: completed.endedAt,
    status: 'COMPLETED', exerciseCount: 2,
  }], nextCursor: null });

  await db.exercise.update({ where: { id: exercise.id }, data: {
    name: 'Nome novo', primaryMuscle: 'BACK', equipment: 'DUMBBELL', measurementType: 'TIME', isActive: false,
  } });
  const detail = await get(`/sessions/${session.id}`);
  assert.deepEqual(detail, completed);
  assert.deepEqual(detail.exercises.map((item: { order: number }) => item.order), [0, 1]);
  const historicalExercise = detail.exercises[0];
  assert.equal(historicalExercise.notes, 'Amplitude controlada; manter esta nota.');
  assert.deepEqual([
    historicalExercise.exerciseNameSnapshot, historicalExercise.primaryMuscleSnapshot,
    historicalExercise.equipmentSnapshot, historicalExercise.measurementTypeSnapshot,
  ], ['Supino', 'CHEST', 'BARBELL', 'WEIGHT_REPS']);
  assert.deepEqual(historicalExercise.sets.map((set: { type: string; setNumber: number }) => [set.type, set.setNumber]),
    [['WORKING', 1], ['WARMUP', 2], ['DROP_SET', 3], ['WORKING', 4]]);
  const [working, warmup, drop, unfinished] = historicalExercise.sets;
  assert.deepEqual([working.weight, working.reps, working.restTime], [50, 8, 45]);
  assert.deepEqual([warmup.weight, warmup.reps], [20, 12]);
  assert.ok(working.completedAt && warmup.completedAt && drop.completedAt);
  assert.equal(unfinished.completedAt, null);
  assert.equal(unfinished.weight, null);
  assert.equal(unfinished.reps, null);
  assert.equal(drop.weight, null);
  assert.equal(drop.reps, null);
  assert.deepEqual(drop.segments.map((segment: { order: number; weight: number; reps: number; completedAt: string }) =>
    [segment.order, segment.weight, segment.reps, segment.completedAt]), [[0, 40, 6, drop.completedAt], [1, 30, 6, drop.completedAt]]);
  console.log('PASS detalhe completo, ACTIVE, finish, notes, snapshots imunes ao catálogo e séries/segmentos ordenados.');

  const discarded = await request('POST', '/sessions', { name: 'Descartado' }, 201);
  const discardedDetail = await request('POST', `/sessions/${discarded.id}/discard`);
  const active = await request('POST', '/sessions', { name: 'Em andamento' }, 201);
  assert.deepEqual(await get(`/sessions/${discarded.id}`), discardedDetail);
  assert.deepEqual(await get(`/sessions/${active.id}`), active);
  assert.deepEqual(await get('/history'), single);

  // Controlled dates and IDs force ties across page boundaries, independently of insertion order.
  const fixture = (id: string, endedAt: string, userId = owner.id) => db.workoutSession.create({ data: {
    id, userId, name: 'Sessão anterior', status: 'COMPLETED',
    startedAt: new Date('2020-01-01T00:00:00.000Z'), endedAt: new Date(endedAt),
  } });
  const ids = Array.from({ length: 24 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  for (const id of [...ids].reverse()) await fixture(id, '2021-01-01T12:00:00.000Z');
  const old = await fixture(randomUUID(), '2020-06-01T00:00:00.000Z');
  const foreign = await fixture(randomUUID(), '2022-01-01T00:00:00.000Z', other.id);
  const expected = [session.id, ...[...ids].reverse(), old.id];
  const defaultPage = await get('/history');
  assert.equal(defaultPage.items.length, 20);
  assert.ok(defaultPage.nextCursor);
  const all = await get('/history?limit=100');
  assert.deepEqual(all.items.map((item: { id: string }) => item.id), expected);
  assert.equal(all.nextCursor, null);
  assert.ok(all.items.slice(1).every((item: { exerciseCount: number }) => item.exerciseCount === 0));
  for (const item of all.items) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'startedAt', 'endedAt', 'status', 'exerciseCount'].sort());
  }

  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await get(`/history?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
    assert.ok(page.items.length <= 3);
    seen.push(...page.items.map((item: { id: string }) => item.id));
    cursor = page.nextCursor;
    assert.ok(seen.length <= expected.length, 'Pagination must terminate without duplicates');
  } while (cursor);
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen).size, expected.length);
  assert.deepEqual(await get(`/history?cursor=${encode({ id: old.id, endedAt: old.endedAt!.toISOString() })}`), { items: [], nextCursor: null });
  const first = await get('/history?limit=1');
  const inserted = await fixture(randomUUID(), '2099-01-01T00:00:00.000Z');
  const afterInsert = await get(`/history?limit=100&cursor=${first.nextCursor}`);
  assert.deepEqual(afterInsert.items.map((item: { id: string }) => item.id), expected.slice(1));
  assert.equal((await get('/history?limit=1')).items[0].id, inserted.id);
  assert.deepEqual((await get('/history', 200, token(other.id))).items.map((item: { id: string }) => item.id), [foreign.id]);
  const foreignCursor = encode({ id: foreign.id, endedAt: foreign.endedAt!.toISOString() });
  assert.ok((await get(`/history?limit=100&cursor=${foreignCursor}`)).items.every((item: { id: string }) => item.id !== foreign.id));
  console.log('PASS histórico vazio/único/múltiplo, exclusão ACTIVE/DISCARDED/alheio, limite, empates, cursor e inserção entre páginas.');

  const missing = await get(`/sessions/${randomUUID()}`, 404);
  assert.deepEqual(await get(`/sessions/${foreign.id}`, 404), missing);
  for (const own of [session.id, active.id, discarded.id]) {
    assert.deepEqual(await get(`/sessions/${own}`, 404, token(other.id)), missing);
  }
  await get('/sessions/not-a-uuid', 400);
  for (const path of ['/history', `/sessions/${session.id}`]) {
    await get(path, 401, '');
    await get(path, 401, 'invalid');
    await get(path, 401, app.jwt.sign({ id: owner.id, scope: 'session' }, { expiresIn: -1 }));
    for (const scope of ['pending_verification', 'reset_password', '']) await get(path, 403, token(owner.id, scope));
  }
  for (const query of [
    'limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=abc', 'limit=', 'limit=2&limit=3',
    `userId=${other.id}`, 'status=DISCARDED', 'cursor=', 'cursor=!', 'cursor=e30',
    `cursor=${'a'.repeat(257)}`, `cursor=${encode({ id: old.id, endedAt: 'invalid' })}`,
    `cursor=${encode({ id: 'invalid', endedAt: old.endedAt })}`,
    `cursor=${encode({ id: old.id, endedAt: old.endedAt, userId: other.id })}`,
  ]) await get(`/history?${query}`, 400);

  // Reads must leave actual persisted data untouched, including discarded sessions and the volume cache.
  const persisted = () => db.workoutSession.findMany({ orderBy: { id: 'asc' }, include: {
    exercises: { orderBy: { order: 'asc' }, include: {
      sets: { orderBy: { setNumber: 'asc' }, include: { segments: { orderBy: { order: 'asc' } } } },
    } },
  } });
  const beforeReads = await persisted();
  await get('/history?limit=100');
  for (const id of [session.id, active.id, discarded.id]) await get(`/sessions/${id}`);
  assert.deepEqual(await persisted(), beforeReads);
  assert.equal('volumeTotal' in detail, false);
  assert.equal('userId' in detail, false);
  assert.equal(await db.workoutSession.count({ where: { id: discarded.id, status: 'DISCARDED' } }), 1);
  console.log('PASS JWT/escopo, IDOR anti-enumeração, UUID/query/cursor inválidos e leituras sem mutações ou métricas falsas.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
