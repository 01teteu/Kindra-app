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
  const owner = await db.user.create({ data: { email: 'previous-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'previous-other@example.test' } });
  const exercises = await Promise.all([0, 1, 2].map(index => db.exercise.create({ data: {
    origin: 'GLOBAL', slug: `previous-${index}`, name: 'Mesmo nome', primaryMuscle: 'CHEST', equipment: 'BARBELL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST',
    movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Controle o movimento.',
  } })));
  const stamp = new Date('2020-01-01T01:00:00Z');
  const historical = async (endedAt: string, userId = owner.id, status: 'COMPLETED' | 'DISCARDED' = 'COMPLETED', note: string | null = 'Nota anterior', id = randomUUID()) => {
    const session = await db.workoutSession.create({ data: { id, userId, name: 'Anterior', startedAt: new Date('2020-01-01'),
      exercises: { create: [0, 1].map(order => ({ exerciseId: exercises[0].id, order, notes: order ? 'Não escolher duplicado' : note,
        sets: { create: [
          { setNumber: 1, type: 'WARMUP', weight: 10, reps: 12, completedAt: stamp },
          { setNumber: 2, type: 'WORKING', weight: 30, reps: 10, completedAt: stamp },
          { setNumber: 3, type: 'WORKING', weight: 99, reps: 1 },
          { setNumber: 4, type: 'DROP_SET', completedAt: stamp, segments: { create: [
            { order: 1, weight: 20, reps: 6, completedAt: stamp }, { order: 0, weight: 25, reps: 8, completedAt: stamp },
          ] } },
          { setNumber: 5, type: 'WORKING', weight: 32, reps: 8, completedAt: stamp },
          { setNumber: 6, type: 'DROP_SET', segments: { create: { order: 0, weight: 50, reps: 1, completedAt: stamp } } },
        ] },
      })) },
    }, include: { exercises: { orderBy: { order: 'asc' } } } });
    await db.workoutSession.update({ where: { id }, data: { status, endedAt: new Date(endedAt) } });
    return session;
  };
  const get = async (id: string, status = 200, auth = app.jwt.sign({ id: owner.id, scope: 'session' })) => {
    const result = await app.inject({ url: `/api/workouts/sessions/${id}/previous-performance`, headers: { authorization: `Bearer ${auth}` } });
    assert.equal(result.statusCode, status, result.body); return result.json();
  };
  const old = await historical('2020-02-01');
  const latest = await historical('2020-03-01', owner.id, 'COMPLETED', 'Nota correta', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  await historical('2020-03-01', owner.id, 'COMPLETED', 'Empate perde', '00000000-0000-4000-8000-000000000001');
  await historical('2020-03-02', owner.id, 'DISCARDED');
  const foreign = await historical('2020-03-03', other.id);
  await historical('2020-04-01'); // equality must be excluded
  await historical('2020-05-01'); // future must be excluded
  const target = await db.workoutSession.create({ data: { userId: owner.id, name: 'Atual', startedAt: new Date('2020-04-01'),
    exercises: { create: [exercises[0], exercises[1], exercises[0], exercises[2]].map((exercise, order) => ({ exerciseId: exercise.id, order })) },
  }, include: { exercises: { orderBy: { order: 'asc' } } } });
  const result = await get(target.id);
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items.map((item: { workoutExerciseId: string }) => item.workoutExerciseId), target.exercises.map(item => item.id));
  const previous = result.items[0].previous;
  assert.equal(previous.sessionId, latest.id);
  assert.equal(previous.workoutExerciseId, latest.exercises[0].id);
  assert.equal(previous.notes, 'Nota correta');
  assert.deepEqual(result.items[2].previous, previous);
  assert.equal(result.items[1].previous, null);
  assert.equal(result.items[3].previous, null);
  assert.deepEqual(previous.sets.map((set: { type: string; ordinal: number; weight: number }) => [set.type, set.ordinal, set.weight]),
    [['WARMUP', 1, 10], ['WORKING', 1, 30], ['DROP_SET', 1, null], ['WORKING', 2, 32]]);
  assert.deepEqual(previous.sets[2].segments.map((segment: { weight: number; reps: number }) => [segment.weight, segment.reps]), [[25, 8], [20, 6]]);
  assert.ok(previous.sets.every((set: { completedAt: string }) => set.completedAt));
  assert.equal((await get(old.id)).items[0].previous, null); // own session is never its previous
  assert.equal((await get(foreign.id, 404)).error, (await get(randomUUID(), 404)).error);
  await get('invalid', 400);
  await get(target.id, 401, 'invalid');
  await get(target.id, 403, app.jwt.sign({ id: owner.id, scope: 'reset_password' }));
  await db.exercise.update({ where: { id: exercises[0].id }, data: { name: 'Renomeado', measurementType: 'TIME' } });
  assert.deepEqual(await get(target.id), result);
  await db.workoutSession.update({ where: { id: target.id }, data: { status: 'COMPLETED', endedAt: new Date('2020-06-01') } });
  assert.deepEqual(await get(target.id), result);
  // A newer occurrence with no completed work and no note must not fall back to older work/notes.
  const empty = await db.workoutSession.create({ data: { userId: owner.id, name: 'Vazio', startedAt: new Date('2020-06-02'),
    exercises: { create: { exerciseId: exercises[0].id, order: 0 } },
  } });
  await db.workoutSession.update({ where: { id: empty.id }, data: { status: 'COMPLETED', endedAt: new Date('2020-06-03') } });
  const next = await db.workoutSession.create({ data: { userId: owner.id, name: 'Novo', startedAt: new Date('2020-06-04'),
    exercises: { create: { exerciseId: exercises[0].id, order: 0 } },
  } });
  const emptyPrevious = (await get(next.id)).items[0].previous;
  assert.equal(emptyPrevious.sessionId, empty.id); assert.equal(emptyPrevious.notes, null); assert.deepEqual(emptyPrevious.sets, []);
  assert.ok(!/estimated1RM|personalBest|isPR|achievement|volume|record/.test(JSON.stringify(result)));
  console.log('PASS batch, temporalidade estrita, desempate, duplicados, ownership, snapshots, notes, ordinais, séries/segmentos concluídos e ausência de métricas.');
} finally { await app.close(); await db.$disconnect(); await database.cleanup(); }
