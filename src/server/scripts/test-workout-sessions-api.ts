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
  const owner = await db.user.create({ data: { email: 'session-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'session-other@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const request = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object, auth = token(owner.id)) =>
    app.inject({ method, url: `/api/workouts/sessions${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
  const exerciseData = { name: 'Supino', primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS' as const, aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL' as const, instructions: 'Execute com controle.' };
  const global = await db.exercise.create({ data: { ...exerciseData, origin: 'GLOBAL', slug: 'session-global' } });
  const custom = await db.exercise.create({ data: { ...exerciseData, origin: 'CUSTOM', userId: owner.id, slug: 'session-custom' } });
  const foreign = await db.exercise.create({ data: { ...exerciseData, origin: 'CUSTOM', userId: other.id, slug: 'session-custom' } });
  const inactive = await db.exercise.create({ data: { ...exerciseData, origin: 'GLOBAL', slug: 'session-inactive', isActive: false } });
  for (const auth of ['invalid', token(owner.id, 'reset_password')]) {
    const status = auth === 'invalid' ? 401 : 403;
    for (const [method, path, payload] of [
      ['POST', '', {}], ['GET', '/active', undefined], ['POST', `/${randomUUID()}/exercises`, { exerciseId: global.id }],
      ['PATCH', `/${randomUUID()}/exercises/${randomUUID()}`, { notes: 'note' }], ['DELETE', `/${randomUUID()}/exercises/${randomUUID()}`, undefined],
    ] as const) assert.equal((await request(method, path, payload, auth)).statusCode, status);
  }
  const empty = await request('GET', '/active');
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body, 'null');
  assert.equal((await request('POST', '', { userId: other.id })).statusCode, 400);
  assert.equal((await request('POST', '', { name: ' ' })).statusCode, 400);
  const started = await request('POST', '', {});
  assert.equal(started.statusCode, 201, started.body);
  const session = started.json();
  assert.equal(session.name, 'Treino livre');
  assert.equal(session.status, 'ACTIVE');
  assert.ok(Number.isFinite(Date.parse(session.startedAt)));
  assert.deepEqual(session.exercises, []);
  assert.equal('userId' in session, false);
  assert.equal('volumeTotal' in session, false);
  assert.equal((await request('POST', '', {})).statusCode, 409);
  assert.deepEqual((await request('GET', '/active')).json(), session);
  const otherResponse = await request('POST', '', { name: ' Outro treino ' }, token(other.id));
  assert.equal(otherResponse.statusCode, 201);
  const otherSession = otherResponse.json();
  assert.equal(otherSession.name, 'Outro treino');
  assert.equal((await request('GET', '/active', undefined, token(other.id))).json().id, otherSession.id);
  const foreignExecuted = await db.workoutExercise.create({ data: { sessionId: otherSession.id, exerciseId: foreign.id, order: 0 } });
  const base = `/${session.id}/exercises`;
  assert.equal((await request('POST', '/invalid/exercises', { exerciseId: global.id })).statusCode, 400);
  assert.equal((await request('POST', `/${otherSession.id}/exercises`, { exerciseId: global.id })).statusCode, 404);
  assert.equal((await request('POST', `/${randomUUID()}/exercises`, { exerciseId: global.id })).statusCode, 404);
  assert.equal((await request('POST', base, { exerciseId: global.id, exerciseNameSnapshot: 'fake' })).statusCode, 400);
  for (const exerciseId of [foreign.id, inactive.id, randomUUID()]) {
    assert.equal((await request('POST', base, { exerciseId })).statusCode, 404);
  }
  const added = await request('POST', base, { exerciseId: global.id });
  assert.equal(added.statusCode, 201, added.body);
  const executed = added.json().exercises[0];
  assert.equal(executed.order, 0);
  assert.equal(executed.exerciseNameSnapshot, global.name);
  assert.deepEqual(executed.sets, []);
  const ownCustom = await request('POST', base, { exerciseId: custom.id });
  assert.equal(ownCustom.statusCode, 201, ownCustom.body);
  assert.deepEqual(ownCustom.json().exercises.map((x: { order: number }) => x.order), [0, 1]);
  const endpoint = `${base}/${executed.id}`;
  const note = await request('PATCH', endpoint, { notes: '  Preciso melhorar a amplitude.  ' });
  assert.equal(note.statusCode, 200, note.body);
  assert.equal(note.json().exercises[0].notes, 'Preciso melhorar a amplitude.');
  assert.equal((await request('GET', '/active')).json().exercises[0].notes, 'Preciso melhorar a amplitude.');
  assert.equal((await request('PATCH', endpoint, { notes: 'x'.repeat(501) })).statusCode, 400);
  assert.equal((await request('PATCH', endpoint, { notes: 'x'.repeat(500) })).statusCode, 200);
  for (const notes of ['', '   ', null]) {
    const result = await request('PATCH', endpoint, { notes });
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().exercises[0].notes, null);
  }
  for (const method of ['PATCH', 'DELETE'] as const) {
    const payload = method === 'PATCH' ? { notes: 'invasão' } : undefined;
    for (const path of [`/${otherSession.id}/exercises/${foreignExecuted.id}`, `${base}/${foreignExecuted.id}`, `${base}/${randomUUID()}`]) {
      assert.equal((await request(method, path, payload)).statusCode, 404);
    }
  }
  assert.equal((await db.workoutExercise.findUniqueOrThrow({ where: { id: foreignExecuted.id } })).notes, null);
  const removed = await request('DELETE', endpoint);
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(removed.json().exercises.map((x: { order: number }) => x.order), [1]);
  assert.equal(await db.workoutExercise.count({ where: { id: executed.id } }), 0);
  const concurrent = await Promise.all([global.id, custom.id].map(exerciseId => request('POST', base, { exerciseId })));
  for (const result of concurrent) assert.equal(result.statusCode, 201, result.body);
  assert.deepEqual((await request('GET', '/active')).json().exercises.map((x: { order: number }) => x.order), [1, 2, 3]);
  console.log('PASS treino livre, GET, JWT/escopo, GLOBAL/CUSTOM, IDOR, notes, remoção com lacunas e adições concorrentes.');

  for (const [target, status] of [[session, 'COMPLETED'], [otherSession, 'DISCARDED']] as const) {
    const userId = status === 'COMPLETED' ? owner.id : other.id;
    await db.workoutSession.update({ where: { id: target.id }, data: { status, endedAt: new Date() } });
    const child = await db.workoutExercise.findFirstOrThrow({ where: { sessionId: target.id } });
    const path = `/${target.id}/exercises`;
    for (const [method, suffix, payload] of [['POST', '', { exerciseId: global.id }], ['PATCH', `/${child.id}`, { notes: 'blocked' }], ['DELETE', `/${child.id}`, undefined]] as const) {
      assert.equal((await request(method, path + suffix, payload, token(userId))).statusCode, 409);
    }
    assert.equal((await request('GET', '/active', undefined, token(userId))).body, 'null');
  }
  const foreignRoutine = await db.routine.create({ data: { userId: other.id, name: 'Privada' } });
  for (const routineId of [foreignRoutine.id, randomUUID()]) assert.equal((await request('POST', '', { routineId })).statusCode, 404);
  const routine = await db.routine.create({ data: {
    userId: owner.id, name: 'Rotina A', exercises: { create: [
      { exerciseId: custom.id, order: 4, notes: 'Nota da rotina' }, { exerciseId: global.id, order: 1 },
    ] },
  } });
  const fromRoutine = await request('POST', '', { routineId: routine.id });
  assert.equal(fromRoutine.statusCode, 201, fromRoutine.body);
  const copied = fromRoutine.json();
  assert.equal(copied.name, routine.name);
  assert.equal(copied.routineId, routine.id);
  assert.deepEqual(copied.exercises.map((x: { order: number; exerciseId: string; notes: string | null }) => [x.order, x.exerciseId, x.notes]), [[1, global.id, null], [4, custom.id, 'Nota da rotina']]);
  await db.routine.update({ where: { id: routine.id }, data: { name: 'Alterada', exercises: { deleteMany: {} } } });
  await db.exercise.update({ where: { id: global.id }, data: { name: 'Catálogo alterado' } });
  assert.deepEqual((await request('GET', '/active')).json(), copied);
  assert.equal(await db.workoutSet.count(), 0);
  await db.workoutSession.update({ where: { id: copied.id }, data: { status: 'COMPLETED', endedAt: new Date() } });
  for (const orders of [[0, 0], [-1, 2]]) {
    const invalidRoutine = await db.routine.create({ data: { userId: owner.id, name: 'Ordem inválida', exercises: { create: orders.map(order => ({ exerciseId: global.id, order })) } } });
    assert.equal((await request('POST', '', { routineId: invalidRoutine.id })).statusCode, 400);
    assert.equal((await request('GET', '/active')).body, 'null');
  }
  const unavailableRoutine = await db.routine.create({ data: { userId: owner.id, name: 'Arquivada', exercises: { create: [{ exerciseId: custom.id, order: 0 }] } } });
  await db.exercise.update({ where: { id: custom.id }, data: { isActive: false } });
  assert.equal((await request('POST', '', { routineId: unavailableRoutine.id })).statusCode, 404);
  assert.equal((await request('GET', '/active')).body, 'null');
  const starts = await Promise.all([request('POST', '', {}), request('POST', '', {})]);
  assert.deepEqual(starts.map(x => x.statusCode).sort(), [201, 409]);
  assert.equal(await db.workoutSession.count({ where: { userId: owner.id, status: 'ACTIVE' } }), 1);
  assert.equal(await db.workoutSet.count(), 0);
  console.log('PASS estados encerrados, Routine independente/ordenada, snapshots, rotinas inválidas sem escrita parcial e início concorrente; nenhuma série.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
