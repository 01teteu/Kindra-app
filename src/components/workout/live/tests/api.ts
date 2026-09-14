import assert from 'node:assert/strict';
import { fixture } from './fixture';
import { createLiveWorkoutStore } from '../state';

const { app, db, owner, exercise, token, cleanup } = await fixture();
const originalFetch = globalThis.fetch;
const requests: string[] = [];
globalThis.fetch = async (input, init) => {
  const url = String(input); requests.push(`${init?.method ?? 'GET'} ${url}`);
  const result = await app.inject({ method: init?.method as 'GET' | 'POST' | 'PATCH' | 'DELETE', url,
    payload: init?.body ? String(init.body) : undefined,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}` },
  });
  return new Response(result.body, { status: result.statusCode });
};
try {
  const store = createLiveWorkoutStore();
  await store.load();
  assert.equal(store.getSnapshot().session, null);
  const mutation = async (path: string, method: 'POST' | 'PATCH' | 'DELETE', data?: object) => {
    assert.equal(await store.mutate(path, path, method, data), true, store.getSnapshot().error);
    return store.getSnapshot().session!;
  };
  const started = await mutation('', 'POST', { name: 'Treino API Live' });
  const sessionPath = `/${started.id}`;
  const added = await mutation(`${sessionPath}/exercises`, 'POST', { exerciseId: exercise.id });
  const base = `${sessionPath}/exercises/${added.exercises[0].id}`;
  const sets = `${base}/sets`;
  const working = (await mutation(sets, 'POST', {})).exercises[0].sets[0];
  await mutation(`${sets}/${working.id}`, 'PATCH', { weight: 32.5, reps: 8, restTime: 90 });
  await mutation(`${sets}/${working.id}/completion`, 'PATCH', { completed: true });
  const warmup = (await mutation(sets, 'POST', { type: 'WARMUP', weight: 15, reps: 12 })).exercises[0].sets[1];
  const drop = (await mutation(sets, 'POST', { type: 'DROP_SET' })).exercises[0].sets[2];
  const segments = `${sets}/${drop.id}/segments`;
  for (const weight of [30, 20]) await mutation(segments, 'POST', { weight, reps: 6 });
  await mutation(`${sets}/${drop.id}/completion`, 'PATCH', { completed: true });
  await mutation(base, 'PATCH', { notes: 'Banco 3' });
  const beforeRefresh = store.getSnapshot().session;
  const refreshed = createLiveWorkoutStore();
  await refreshed.load();
  assert.deepEqual(refreshed.getSnapshot().session, beforeRefresh);
  assert.equal(await store.mutate('bad-conversion', `${sets}/${warmup.id}`, 'PATCH', { type: 'DROP_SET' }), false);
  assert.equal(store.getSnapshot().session?.exercises[0].sets[1].type, 'WARMUP');
  await mutation(`${sets}/${working.id}/completion`, 'PATCH', { completed: false });
  await mutation(`${sets}/${drop.id}/completion`, 'PATCH', { completed: false });
  const segment = store.getSnapshot().session!.exercises[0].sets[2].segments[0];
  await mutation(`${segments}/${segment.id}`, 'PATCH', { reps: 5 });
  await mutation(`${segments}/${segment.id}`, 'DELETE');
  await mutation(`${sets}/${warmup.id}`, 'DELETE');
  const temporary = (await mutation(`${sessionPath}/exercises`, 'POST', { exerciseId: exercise.id })).exercises[1];
  await mutation(`${sessionPath}/exercises/${temporary.id}`, 'DELETE');
  await mutation(`${sessionPath}/finish`, 'POST');
  const persisted = await db.workoutSession.findUniqueOrThrow({ where: { id: started.id }, include: { exercises: { include: { sets: { include: { segments: true } } } } } });
  assert.equal(persisted.status, 'COMPLETED');
  assert.equal(persisted.exercises[0].sets.length, 2);
  assert.ok(persisted.exercises[0].sets.every(set => set.completedAt === null));
  await store.load();
  assert.equal(store.getSnapshot().session, null);
  const routine = await db.routine.create({ data: { userId: owner.id, name: 'Rotina Live', exercises: { create: { exerciseId: exercise.id, order: 0, notes: 'Da rotina' } } } });
  const fromRoutine = await mutation('', 'POST', { routineId: routine.id });
  assert.equal(fromRoutine.exercises[0].notes, 'Da rotina');
  await mutation(`/${fromRoutine.id}/discard`, 'POST');
  await store.load();
  assert.equal(store.getSnapshot().session, null);
  assert.equal((await db.workoutSession.findUniqueOrThrow({ where: { id: fromRoutine.id } })).status, 'DISCARDED');
  assert.ok(requests.includes('GET /api/workouts/sessions/active'));
  console.log('PASS client → routes → Prisma/PostgreSQL: livre/rotina, exercícios, notes, WORKING/WARMUP/DROP, edição/remoção/completion, refresh, conflito, finish e discard.');
} finally {
  globalThis.fetch = originalFetch;
  await cleanup();
}
