import assert from 'node:assert/strict';
import { createWeeklyTrainingStore } from '../../components/workout/weeklyTrainingState.js';
import { localTrainingWeekday, trainingToday, trainingWeekdays, weekdayLabels, type WeeklyTrainingPlan } from '../../shared/weeklyTraining.js';

const a: WeeklyTrainingPlan = { id: 'a', name: 'A', source: 'CUSTOM', isActive: true, days: [
  { id: 'd', dayOfWeek: 'MONDAY', routineId: 'r1', routine: { id: 'r1', name: 'Push A', exerciseCount: 6 } },
] };
const b: WeeklyTrainingPlan = { id: 'b', name: 'B', source: 'GENERATED', isActive: false, days: [] };
const clone = <T>(value: T): T => structuredClone(value);
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const oldTimezone = process.env.TZ;
process.env.TZ = 'America/Fortaleza';
try {
  assert.deepEqual(trainingWeekdays.map(day => weekdayLabels[day].short), ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
  for (let day = 14; day <= 20; day++) assert.equal(localTrainingWeekday(new Date(2026, 8, day, 12)), trainingWeekdays[day - 14]);
  assert.equal(localTrainingWeekday(new Date('2026-09-15T01:00:00Z')), 'MONDAY');
  assert.equal(trainingToday(a, new Date('2026-09-15T01:00:00Z'))?.routine.exerciseCount, 6);
  assert.equal(trainingToday(a, new Date(2026, 8, 17)), null);
  assert.equal(trainingToday(null), null);
  process.env.TZ = 'Pacific/Auckland';
  assert.equal(localTrainingWeekday(new Date('2026-09-13T14:00:00Z')), 'MONDAY');
} finally { if (oldTimezone === undefined) delete process.env.TZ; else process.env.TZ = oldTimezone; }

let plans = clone([a, b]);
let handler: ((path: string, options?: { method?: string; data?: object }) => Promise<any>) | undefined;
const calls: { path: string; options?: { method?: string; data?: object } }[] = [];
const store = createWeeklyTrainingStore(async (path, options) => {
  calls.push({ path, options });
  if (handler) return handler(path, options);
  if (path === '/workouts/plans') return clone(plans);
  if (path === '/workouts/routines?summary=true') return [a.days[0].routine];
  throw Error(`Unexpected ${path}`);
});
await store.load();
assert.equal(store.getSnapshot().selectedId, 'a');
assert.equal(store.getSnapshot().plans[0].days[0].routine.name, 'Push A');
let response = deferred<WeeklyTrainingPlan>();
handler = () => response.promise;
const saving = store.setDay('a', 'MONDAY', 'r2');
store.select('b');
assert.equal(await store.removeDay('b', 'MONDAY'), false); // No overlapping write loses another write.
const modified = clone(a); modified.days[0].routineId = 'r2'; modified.days[0].routine = { id: 'r2', name: 'Upper', exerciseCount: 4 };
response.resolve(modified);
assert.equal(await saving, true);
assert.equal(store.getSnapshot().selectedId, 'b');
assert.deepEqual(store.getSnapshot().plans.find(p => p.id === 'b'), b);
assert.equal(store.getSnapshot().plans.find(p => p.id === 'a')?.days[0].routine.name, 'Upper');
response = deferred();
const failure = store.rename('a', 'Bad');
store.select('b');
response.reject(Error('Falha simulada'));
assert.equal(await failure, false);
assert.equal(store.getSnapshot().errorPlanId, 'a');
assert.equal(store.getSnapshot().plans[0].name, 'A');
handler = async () => ({ ...b, isActive: true });
assert.equal(await store.activate('b'), true);
assert.deepEqual(store.getSnapshot().plans.map(p => p.isActive), [false, true]);
handler = async () => ({ ...modified, isActive: false, days: [] });
await store.removeDay('a', 'MONDAY');
assert.deepEqual(store.getSnapshot().plans.find(p => p.id === 'a')?.days, []);

// An older full load cannot replace a newer response or move the selection.
const older = deferred<WeeklyTrainingPlan[]>();
const newer = deferred<WeeklyTrainingPlan[]>();
let load = 0;
handler = async path => path.includes('routines') ? [] : (++load === 1 ? older.promise : newer.promise);
const first = store.load(); const second = store.load();
newer.resolve([{ ...a, name: 'Newest' }, b]); await second;
store.select('b'); older.resolve([{ ...a, name: 'Obsolete' }]); await first;
assert.equal(store.getSnapshot().plans[0].name, 'Newest'); assert.equal(store.getSnapshot().selectedId, 'b');
const before = store.getSnapshot().plans;
handler = async () => { throw Error('Offline'); }; await store.load();
assert.equal(store.getSnapshot().plans, before); assert.equal(store.getSnapshot().loaded, true);

const slowLoad = deferred<WeeklyTrainingPlan[]>();
handler = async path => path.includes('routines') ? [] : path === '/workouts/plans' ? slowLoad.promise : { ...b, name: 'Confirmed' };
const loading = store.load(); await store.rename('b', 'Confirmed'); slowLoad.resolve([a, b]); await loading;
assert.equal(store.getSnapshot().plans.find(p => p.id === 'b')?.name, 'Confirmed');

plans = []; handler = undefined; await store.load();
assert.equal(store.getSnapshot().selectedId, null); assert.deepEqual(store.getSnapshot().plans, []);
const callsBefore = calls.length;
assert.ok(calls.every(call => !call.options?.method || call.options.method !== 'POST' || call.path !== '/workouts/plans'));
handler = async () => a; await store.create('A');
assert.equal(store.getSnapshot().selectedId, 'a'); assert.equal(store.getSnapshot().plans[0].isActive, true);
assert.deepEqual(calls[callsBefore].options?.data, { name: 'A', source: 'CUSTOM' });

let posts = 0;
handler = async (path, options) => { if (path.endsWith('/active')) return null;
  assert.equal(path, '/workouts/sessions'); assert.deepEqual(options?.data, { routineId: 'r1' }); posts++; return { id: 'session' }; };
assert.equal(await store.start('r1'), true); assert.equal(posts, 1);
handler = async path => { assert.ok(path.endsWith('/active')); return { id: 'existing' }; };
assert.equal(await store.start('r2'), true); assert.equal(posts, 1);
let reads = 0;
handler = async path => { if (path.endsWith('/active')) return ++reads === 1 ? null : { id: 'racing-session' };
  throw Object.assign(Error('Active conflict'), { status: 409 }); };
assert.equal(await store.start('r1'), true); assert.equal(reads, 2);
handler = async path => { if (path.endsWith('/active')) return null; throw Object.assign(Error('Rotina indisponível'), { status: 404 }); };
assert.equal(await store.start('missing'), false); assert.equal(store.getSnapshot().error, 'Rotina indisponível');
console.log('PASS frontend state: weekdays/local timezone/rest, edits/removal/activation, explicit creation, failures and stale responses, start/resume/race.');
