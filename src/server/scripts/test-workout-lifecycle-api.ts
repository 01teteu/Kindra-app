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
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
try {
  const owner = await db.user.create({ data: { email: 'lifecycle-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'lifecycle-other@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const auth = token(owner.id);
  const raw = (method: Method, path: string, payload?: object, authorization = auth) => app.inject({
    method, url: `/api/workouts/sessions${path}`, payload, headers: { authorization: `Bearer ${authorization}` },
  });
  const request = async (method: Method, path: string, payload?: object, status = 200, authorization = auth) => {
    const result = await raw(method, path, payload, authorization);
    assert.equal(result.statusCode, status, `${method} ${path}: ${result.body}`);
    if (status === 409) assert.deepEqual(result.json(), { error: 'A sessão não está ACTIVE.' });
    return result.json();
  };
  const exercise = await db.exercise.create({ data: {
    origin: 'GLOBAL', slug: 'lifecycle-global', name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST',
    movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Execute com controle.',
  } });
  const persisted = (id: string) => db.workoutSession.findUniqueOrThrow({ where: { id }, include: {
    exercises: { orderBy: { order: 'asc' }, include: { sets: { orderBy: { setNumber: 'asc' }, include: { segments: { orderBy: { order: 'asc' } } } } } },
  } });
  const fixture = async () => {
    const session = await request('POST', '', { name: 'Task 1C' }, 201);
    assert.equal(session.endedAt, null);
    const response = await request('POST', `/${session.id}/exercises`, { exerciseId: exercise.id }, 201);
    const base = `/${session.id}/exercises/${response.exercises[0].id}`;
    return { id: session.id as string, base };
  };

  for (const action of ['finish', 'discard'] as const) {
    const { id, base } = await fixture();
    const setBase = `${base}/sets`;
    const working = (await request('POST', setBase, { type: 'WORKING', weight: 50, reps: 8 }, 201)).exercises[0].sets[0];
    await request('PATCH', `${setBase}/${working.id}/completion`, { completed: true });
    const drop = (await request('POST', setBase, { type: 'DROP_SET' }, 201)).exercises[0].sets[1];
    for (const weight of [40, 30]) await request('POST', `${setBase}/${drop.id}/segments`, { weight, reps: 6 }, 201);
    await request('PATCH', `${setBase}/${drop.id}/completion`, { completed: true });
    await request('POST', setBase, { type: 'WORKING' }, 201);
    const unfinishedDrop = (await request('POST', setBase, { type: 'DROP_SET' }, 201)).exercises[0].sets[3];
    await request('POST', `${setBase}/${unfinishedDrop.id}/segments`, { weight: 20, reps: 4 }, 201);
    await request('PATCH', base, { notes: 'Preservar execução' });
    const before = await persisted(id);
    const active = await request('GET', '/active');
    const path = `/${id}/${action}`;
    for (const payload of [{ endedAt: '2000-01-01T00:00:00Z' }, { status: 'ACTIVE' }, { userId: other.id }]) {
      await request('POST', path, payload, 400);
    }
    await request('POST', `/invalid/${action}`, {}, 400);
    await request('POST', path, {}, 401, 'invalid');
    await request('POST', path, {}, 403, token(owner.id, 'reset_password'));
    const foreign = await request('POST', path, {}, 404, token(other.id));
    assert.deepEqual(foreign, await request('POST', `/${randomUUID()}/${action}`, {}, 404));
    assert.deepEqual(await persisted(id), before);
    const start = Date.now();
    const closed = await request('POST', path);
    const end = Date.now();
    assert.equal(closed.status, action === 'finish' ? 'COMPLETED' : 'DISCARDED');
    assert.ok(Date.parse(closed.endedAt) >= start && Date.parse(closed.endedAt) <= end);
    assert.ok(Date.parse(closed.endedAt) >= Date.parse(closed.startedAt));
    assert.deepEqual(closed, { ...active, status: closed.status, endedAt: closed.endedAt });
    const after = await persisted(id);
    assert.deepEqual(after, { ...before, status: closed.status, endedAt: new Date(closed.endedAt), updatedAt: after.updatedAt });
    assert.equal(after.exercises[0].sets[2].completedAt, null);
    assert.equal(after.exercises[0].sets[3].completedAt, null);
    assert.equal(after.exercises[0].sets[3].segments[0].completedAt, null);
    assert.equal(await request('GET', '/active'), null);
    for (const repeat of ['finish', 'discard']) await request('POST', `/${id}/${repeat}`, {}, 409);
    const segmentBase = `${setBase}/${unfinishedDrop.id}/segments`;
    const segmentId = after.exercises[0].sets[3].segments[0].id;
    const mutations: [Method, string, object?][] = [
      ['POST', `/${id}/exercises`, { exerciseId: exercise.id }], ['DELETE', base], ['PATCH', base, { notes: 'Alterar' }],
      ['POST', setBase, {}], ['PATCH', `${setBase}/${working.id}`, { reps: 9 }], ['DELETE', `${setBase}/${working.id}`],
      ['POST', segmentBase, { weight: 10, reps: 2 }], ['PATCH', `${segmentBase}/${segmentId}`, { reps: 2 }], ['DELETE', `${segmentBase}/${segmentId}`],
    ];
    for (const set of [working, drop, unfinishedDrop]) for (const completed of [true, false]) {
      mutations.push(['PATCH', `${setBase}/${set.id}/completion`, { completed }]);
    }
    for (const [method, url, payload] of mutations) await request(method, url, payload, 409);
    assert.deepEqual(await persisted(id), after);
    console.log(`PASS ${action}: fluxo real, datas do servidor, ownership, persistência integral e imutabilidade 1A/1B.`);
  }

  for (const actions of [['finish', 'finish'], ['discard', 'discard'], ['finish', 'discard']]) {
    const { id } = await fixture();
    const results = await Promise.all(actions.map(action => raw('POST', `/${id}/${action}`)));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const winner = results.find(r => r.statusCode === 200)!.json();
    assert.deepEqual(results.find(r => r.statusCode === 409)!.json(), { error: 'A sessão não está ACTIVE.' });
    const saved = await persisted(id);
    assert.equal(saved.status, winner.status);
    assert.equal(saved.endedAt!.toISOString(), winner.endedAt);
    assert.equal(await request('GET', '/active'), null);
  }
  console.log('PASS concorrência finish/finish, discard/discard e finish/discard: exatamente uma transição.');

  for (const action of ['finish', 'discard']) {
    for (const kind of ['exercise', 'notes', 'set', 'segment']) {
      const { id, base } = await fixture();
      const created = await request('POST', `${base}/sets`, { type: 'DROP_SET' }, 201);
      const dropId = created.exercises[0].sets[0].id;
      const operations: Record<string, [Method, string, object]> = {
        exercise: ['POST', `/${id}/exercises`, { exerciseId: exercise.id }],
        notes: ['PATCH', base, { notes: 'Concorrente' }],
        set: ['POST', `${base}/sets`, { weight: 10, reps: 5 }],
        segment: ['POST', `${base}/sets/${dropId}/segments`, { weight: 10, reps: 5 }],
      };
      const [method, path, payload] = operations[kind];
      const [closed, mutation] = await Promise.all([raw('POST', `/${id}/${action}`), raw(method, path, payload)]);
      assert.equal(closed.statusCode, 200, closed.body);
      assert.ok([kind === 'notes' ? 200 : 201, 409].includes(mutation.statusCode), mutation.body);
      if (mutation.statusCode === 409) assert.deepEqual(mutation.json(), { error: 'A sessão não está ACTIVE.' });
      const saved = await persisted(id);
      // End response must include every mutation that committed before the transition.
      const response = closed.json();
      assert.equal(saved.exercises.length, response.exercises.length);
      for (const [i, ex] of saved.exercises.entries()) {
        assert.equal(ex.notes, response.exercises[i].notes);
        assert.equal(ex.sets.length, response.exercises[i].sets.length);
        for (const [j, set] of ex.sets.entries()) {
          assert.equal(set.segments.length, response.exercises[i].sets[j].segments.length);
        }
      }
      await request(method, path, payload, 409);
      assert.deepEqual(await persisted(id), saved);
    }
  }
  console.log('PASS finish/discard concorrentes com exercícios, notes, séries e segmentos; Task 1C validada.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
