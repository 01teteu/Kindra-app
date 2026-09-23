import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { createTestDatabase } from './postgresql-test-db.js';
import type { WorkoutProgress } from '../../shared/workoutProgress.js';

const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(jwt, { secret: 'progress-isolated-test-secret' });
await app.register(workoutRoutes, { prefix: '/api/workouts' });
try {
  const owner = await db.user.create({ data: { email: 'progress-owner@example.test' } });
  const other = await db.user.create({ data: { email: 'progress-other@example.test' } });
  const token = (id: string, scope = 'session') => app.jwt.sign({ id, scope });
  const auth = token(owner.id);
  const base = { startDate: '2026-09-01', endDate: '2026-09-01', timeZone: 'America/Fortaleza' };
  const get = async (query: Record<string, string> = base, status = 200, authorization = auth) => {
    const response = await app.inject({
      method: 'GET', url: `/api/workouts/progress?${new URLSearchParams(query)}`,
      headers: authorization ? { authorization: `Bearer ${authorization}` } : {},
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json() as WorkoutProgress;
  };
  const catalog = async (name: string, userId?: string) => db.exercise.create({ data: {
    name, slug: randomUUID(), origin: userId ? 'CUSTOM' : 'GLOBAL', userId: userId ?? null,
    primaryMuscle: 'CHEST', secondaryMuscles: [], equipment: 'BARBELL', measurementType: 'WEIGHT_REPS',
    aliases: [], muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Controlado.',
  } });
  const global = await catalog('Nome histórico');
  const custom = await catalog('Personalizado', owner.id);
  const privateOther = await catalog('Privado de outro usuário', other.id);
  type Entry = { exerciseId: string; weight: number; reps: number; drop?: boolean };
  const fixture = async (startedAt: string, entries: Entry[], options: {
    userId?: string; status?: 'ACTIVE' | 'COMPLETED' | 'DISCARDED'; id?: string; endedAt?: string;
  } = {}) => {
    const status = options.status ?? 'COMPLETED';
    const session = await db.workoutSession.create({ data: {
      id: options.id, userId: options.userId ?? owner.id, name: 'Histórico de teste', status,
      startedAt: new Date(startedAt), endedAt: status === 'ACTIVE' ? null : new Date(options.endedAt ?? startedAt),
      volumeTotal: 999999, // Deliberately stale cache must never be consulted.
    } });
    for (const [order, entry] of entries.entries()) {
      await db.workoutExercise.create({ data: {
        sessionId: session.id, exerciseId: entry.exerciseId, order,
        sets: { create: [
          { setNumber: 1, type: 'WORKING', weight: entry.weight, reps: entry.reps, completedAt: new Date(startedAt) },
          { setNumber: 2, type: 'WARMUP', weight: 99999, reps: 1, completedAt: new Date(startedAt) },
          { setNumber: 3, type: 'WORKING', weight: null, reps: null },
          ...(entry.drop ? [{ setNumber: 4, type: 'DROP_SET' as const, weight: null, reps: null, completedAt: null, segments: { create: [
            { order: 0, weight: 50, reps: 5, completedAt: new Date(startedAt) },
            { order: 1, weight: 30, reps: 8, completedAt: null },
          ] } }] : []),
        ] },
      } });
    }
    return session;
  };
  await get(base, 401, '');
  await get(base, 403, token(owner.id, 'verify_email'));
  const empty = await get();
  assert.equal(empty.period.volume.status, 'no_data');
  assert.deepEqual(empty.exercises, []);
  for (const query of [
    { ...base, startDate: '2026-02-30' }, { ...base, endDate: '2026-08-31' },
    { ...base, timeZone: 'invalid/zone' }, { ...base, timeZone: '+03:00' },
    { startDate: base.startDate, endDate: base.endDate }, { ...base, exerciseId: 'invalid' },
    { ...base, userId: other.id }, { ...base, limit: '201' }, { ...base, cursor: 'bad' },
  ]) await get(query, 400);

  await fixture('2020-01-01T00:00:00Z', [{ exerciseId: global.id, weight: 150, reps: 13 }]);
  await fixture('2026-09-01T02:59:59.999Z', [{ exerciseId: global.id, weight: 300, reps: 1 }], { endedAt: '2026-09-01T04:00:00Z' });
  const first = await fixture('2026-09-01T03:00:00Z', [
    { exerciseId: global.id, weight: 100, reps: 5, drop: true },
    { exerciseId: global.id, weight: 20, reps: 1 },
    { exerciseId: custom.id, weight: 0, reps: 5 },
  ], { id: '00000000-0000-4000-8000-000000000001', endedAt: '2026-09-02T05:00:00Z' });
  const second = await fixture('2026-09-01T03:00:00Z', [{ exerciseId: global.id, weight: 80, reps: 10 }], { id: '00000000-0000-4000-8000-000000000002' });
  const last = await fixture('2026-09-02T02:59:59.999Z', [{ exerciseId: global.id, weight: 40, reps: 2 }]);
  await fixture('2026-09-02T03:00:00Z', [{ exerciseId: global.id, weight: 400, reps: 1 }]);
  await fixture('2026-09-01T12:00:00Z', [{ exerciseId: global.id, weight: 9000, reps: 1 }], { status: 'ACTIVE' });
  await fixture('2026-09-01T12:00:00Z', [{ exerciseId: global.id, weight: 9000, reps: 1 }], { status: 'DISCARDED' });
  await fixture('2026-09-01T12:00:00Z', [
    { exerciseId: global.id, weight: 10000, reps: 1 }, { exerciseId: privateOther.id, weight: 12000, reps: 1 },
  ], { userId: other.id });
  await db.exercise.update({ where: { id: global.id }, data: { name: 'Nome atual alterado', isActive: false, measurementType: 'TIME' } });
  await db.exercise.update({ where: { id: custom.id }, data: { isActive: false } });

  const full = await get({ ...base, exerciseId: global.id });
  assert.equal(full.period.sessionCount, 3);
  assert.deepEqual(full.period.volume, { value: 1650, status: 'available', contributionCount: 6 });
  assert.equal(full.period.volumeSeries.length, 1);
  assert.equal(full.period.volumeSeries[0].localDate, '2026-09-01');
  assert.equal(full.period.volumeSeries[0].sessionCount, 3);
  assert.equal(full.dataQuality.status, 'complete');
  assert.deepEqual(full.progression!.points.map(point => point.sessionId), [first.id, second.id, last.id]);
  const record = full.exercises.find(item => item.exerciseId === global.id)!;
  assert.equal(record.name, 'Nome histórico');
  assert.equal(record.periodSessionCount, 3);
  assert.equal(record.periodRecords.maxWeight.value, 100);
  assert.equal(record.periodRecords.bestEstimatedOneRepMax.value, 100 * (1 + 5 / 30));
  assert.equal(record.allTimeRecords.maxWeight.value, 400);
  assert.equal(record.allTimeRecords.bestEstimatedOneRepMax.value, 400);
  assert.equal(full.exercises.length, 2);
  const unselected = await get();
  assert.deepEqual(unselected.period, full.period);
  assert.deepEqual(unselected.exercises, full.exercises);
  assert.equal(unselected.progression, null);
  const customSelection = await get({ ...base, exerciseId: custom.id });
  assert.deepEqual(customSelection.period, full.period);
  assert.equal(customSelection.progression!.points[0].bestEstimatedOneRepMax.status, 'no_data');
  await get({ ...base, exerciseId: privateOther.id }, 404);
  await get({ ...base, exerciseId: randomUUID() }, 404);
  const foreign = await get(base, 200, token(other.id));
  assert.equal(foreign.period.volume.value, 22000);
  assert.equal(foreign.exercises.find(item => item.exerciseId === global.id)!.allTimeRecords.maxWeight.value, 10000);
  assert.ok(!foreign.exercises.some(item => item.exerciseId === custom.id));

  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await get({ ...base, exerciseId: global.id, limit: '1', ...(cursor ? { cursor } : {}) });
    assert.deepEqual(page.period, full.period);
    assert.deepEqual(page.exercises, full.exercises);
    seen.push(...page.progression!.points.map(point => point.sessionId));
    cursor = page.progression!.nextCursor;
    assert.ok(seen.length <= 3);
    if (cursor) await get({ ...base, exerciseId: custom.id, cursor }, 400);
  } while (cursor);
  assert.deepEqual(seen, [first.id, second.id, last.id]);

  const dstExercise = await catalog('Fuso');
  await fixture('2024-03-10T04:59:59.999Z', [{ exerciseId: dstExercise.id, weight: 1, reps: 1 }]);
  await fixture('2024-03-10T05:00:00Z', [{ exerciseId: dstExercise.id, weight: 2, reps: 1 }]);
  await fixture('2024-03-11T03:59:59.999Z', [{ exerciseId: dstExercise.id, weight: 3, reps: 1 }]);
  await fixture('2024-03-11T04:00:00Z', [{ exerciseId: dstExercise.id, weight: 4, reps: 1 }]);
  const dst = await get({ startDate: '2024-03-10', endDate: '2024-03-10', timeZone: 'America/New_York' });
  assert.equal(dst.period.sessionCount, 2);
  assert.equal(dst.period.volume.value, 5);
  assert.deepEqual(dst.period.volumeSeries.map(day => day.localDate), ['2024-03-10']);

  // Cross the internal batch boundary without changing period metrics or trusting a cursor's owner.
  await db.workoutSession.createMany({ data: Array.from({ length: 201 }, (_, index) => ({
    id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`, userId: owner.id,
    name: 'Lote', status: 'COMPLETED' as const, startedAt: new Date('2026-09-01T20:00:00Z'), endedAt: new Date('2026-09-01T20:00:00Z'),
  })) });
  const batched = await get({ ...base, exerciseId: global.id });
  assert.equal(batched.period.sessionCount, 204);
  assert.deepEqual(batched.period.volume, full.period.volume);
  assert.deepEqual(batched.progression, full.progression);
  assert.equal(batched.exercises.find(item => item.exerciseId === global.id)!.allTimeRecords.maxWeight.value, 400);
  const emptyRange = await get({ ...base, startDate: '1999-01-01', endDate: '1999-01-01' });
  assert.equal(emptyRange.period.volume.status, 'no_data');
  assert.deepEqual(emptyRange.period.volumeSeries, []);
  assert.ok(emptyRange.exercises.length > 0);
  console.log('PASS progresso: autenticação, isolamento, startedAt/fuso, snapshots, agregação, recordes, paginação e lotes.');
} finally {
  await app.close();
  await db.$disconnect();
  await database.cleanup();
}
