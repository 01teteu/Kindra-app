// One representative browser run, using real endpoints and a migrated isolated schema.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import { createTestDatabase } from './postgresql-test-db.js';

const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
assert.ok(existsSync(binary), 'Chromium local necessário.');
const startOnly = process.argv.includes('--start-only');
const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
let generateRequests = 0;
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'POST' && req.url === '/api/workouts/plans/generate') {
    generateRequests++;
    await delay(450);
    if (!startOnly && generateRequests === 1) return reply.status(503).send({ error: 'Falha simulada. Tente novamente.' });
  }
});
await app.register(workoutRoutes, { prefix: '/api/workouts' });
await app.register(serveStatic, { root: path.resolve('dist') });
app.setNotFoundHandler((_, reply) => reply.sendFile('index.html'));
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-starter-browser-'));
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
try {
  const user = await db.user.create({ data: { email: 'starter-browser@example.test', emailVerified: true,
    profile: { create: { firstName: 'Teste', lastName: 'Plano', birthDate: new Date('1990-01-01'), weightKg: 70,
      heightCm: 170, activityLevel: 'Leve', goal: 'Manutencao' } } } });
  const catalog = JSON.parse(readFileSync('prisma/seed-data/exercises.json', 'utf8'));
  await db.exercise.createMany({ data: catalog.map(({ media, ...exercise }: any) => ({ ...exercise, ...media, origin: 'GLOBAL' })) });
  const token = app.jwt.sign({ id: user.id, scope: 'session' });
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  browser = spawn(binary, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${browserProfile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr!.on('data', chunk => { stderr += chunk.toString(); });
  for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) {
    if (browser.exitCode !== null) throw new Error(`Chromium não iniciou: ${stderr.slice(0, 300)}`);
    await delay(100);
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  assert.ok(endpoint);
  const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const runtimeErrors: string[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
  });
  function send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout CDP: ${method}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression: string) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + response.exceptionDetails.exception?.description);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timeout navegador: ${expression}`);
  }
  async function click(selector: string) {
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus(); document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  async function clickText(text: string) {
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b) throw Error('Botão ausente'); b.click(); })()`);
  }
  async function fill(selector: string, value: string) {
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function capture(name: string) {
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`/tmp/kindra-starter-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  async function key(key: string, code: string = key) {
    const virtualKey = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === ' ' ? 32 : 9;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${url}/workout` });
  await wait(`document.body.textContent.includes('Organize sua semana de treino')`);
  let plan: { id: string; days: { routineId: string }[]; source: string; isActive: boolean };
  let planned: { exercise: { name: string } }[];
  if (!startOnly) {
  assert.equal(await db.weeklyTrainingPlan.count(), 0);
  await capture('empty-mobile');
  await clickText('Montar manualmente');
  await wait(`document.querySelector('input[aria-label="Nome do plano"]')!==null`);
  await key('Escape');
  await clickText('Criar uma base para mim');
  await wait(`document.querySelector('select[aria-label="Dias por semana"]')!==null`);
  assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true);
  assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]').disabled`), true);
  await fill('select[aria-label="Dias por semana"]', '3');
  for (const equipment of ['MACHINE', 'CABLE', 'DUMBBELL']) await click(`input[value="${equipment}"]`);
  await wait('document.documentElement.scrollWidth <= innerWidth');
  assert.equal(await evaluate(`document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth`), true);
  await capture('input-mobile');
  await clickText('Criar base inicial');
  await wait(`document.querySelector('dialog button[type="submit"]').disabled && document.body.textContent.includes('Criando sua base inicial')`);
  await clickText('Criar base inicial');
  await wait(`document.querySelector('dialog [role="alert"]')!==null`);
  assert.equal(await evaluate(`document.querySelector('select[aria-label="Dias por semana"]').value`), '3');
  assert.equal(await evaluate(`document.querySelectorAll('dialog input:checked').length`), 3);
  assert.equal(await db.weeklyTrainingPlan.count(), 0);
  await clickText('Criar base inicial');
  await wait(`document.querySelectorAll('.weekly-day').length===7 && !document.querySelector('dialog[open]')`);
  assert.equal(generateRequests, 2);
  plan = await db.weeklyTrainingPlan.findFirstOrThrow({ where: { userId: user.id }, include: { days: { orderBy: { dayOfWeek: 'asc' } } } });
  assert.equal(plan.source, 'GENERATED'); assert.equal(plan.isActive, true);
  assert.equal(await db.routine.count({ where: { userId: user.id } }), 2);
  assert.equal(await evaluate(`document.querySelector('[data-weekday="MONDAY"]').textContent.includes('Full Body A')`), true);
  assert.equal(await evaluate(`document.querySelector('[data-weekday="FRIDAY"]').textContent.includes('Full Body A')`), true);
  assert.equal(await evaluate(`document.querySelector('[data-weekday="TUESDAY"]').textContent.includes('Descanso')`), true);
  for (const [name, width, height] of [['week-mobile', 390, 844], ['week-laptop', 1280, 800], ['week-desktop', 1920, 1080]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await wait('document.documentElement.scrollWidth <= innerWidth');
    if (width !== 1280) await capture(name);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('[data-weekday="TUESDAY"]');
  await fill('select[aria-label="Treino do dia"]', plan.days[0].routineId);
  await clickText('Salvar alterações');
  await wait(`!document.querySelector('dialog[open]')`);
  assert.equal(await db.weeklyTrainingDay.count({ where: { planId: plan.id } }), 4);
  await click('[aria-label="Editar Full Body A"]');
  await wait(`document.querySelectorAll('.builder-item').length===6`);
  planned = await db.routineExercise.findMany({ where: { routineId: plan.days[0].routineId }, orderBy: { order: 'asc' }, include: { exercise: true } });
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.builder-item h3')].map(e=>e.textContent)`), planned.map(ex => ex.exercise.name));
  await fill('input[name="routineName"]', 'Minha base editada');
  await fill('.builder-item:nth-child(1) input', '75');
  await capture('routine-mobile');
  await clickText('Salvar rotina');
  await wait(`location.pathname==='/workout' && document.body.textContent.includes('Minha base editada')`);
  } else {
    const generated = await app.inject({ method: 'POST', url: '/api/workouts/plans/generate',
      headers: { authorization: `Bearer ${token}` }, payload: { trainingDaysPerWeek: 3, equipment: ['MACHINE', 'CABLE', 'DUMBBELL'] } });
    assert.equal(generated.statusCode, 201, generated.body);
    plan = generated.json();
    const items = await db.routineExercise.findMany({ where: { routineId: plan.days[0].routineId }, orderBy: { order: 'asc' }, include: { exercise: true } });
    planned = items;
    const edited = await app.inject({ method: 'PATCH', url: `/api/workouts/routines/${plan.days[0].routineId}`,
      headers: { authorization: `Bearer ${token}` }, payload: { name: 'Minha base editada', exercises: items.map((ex, order) => ({ exerciseId: ex.exerciseId, order, restTime: order === 0 ? 75 : null })) } });
    assert.equal(edited.statusCode, 200, edited.body);
    await send('Page.navigate', { url: `${url}/workout` });
    await wait(`document.body.textContent.includes('Minha base editada')`);
  }
  await clickText('Minha base editada6 exercícios');
  await wait(`location.pathname==='/workout/live' && document.querySelector('.live-empty button')!==null`);
  await clickText('Iniciar treino');
  await wait(`location.pathname==='/workout/live' && document.querySelectorAll('.live-exercises > div').length===6`);
  const session = await db.workoutSession.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.equal(session.routineId, plan.days[0].routineId);
  assert.equal(session.exercises[0].restTimeSnapshot, 75);
  assert.deepEqual(session.exercises.map(ex => ex.exerciseNameSnapshot), planned.map(ex => ex.exercise.name));
  await wait('document.documentElement.scrollWidth <= innerWidth');
  await capture('live-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await wait('document.documentElement.scrollWidth <= innerWidth');
  assert.deepEqual(runtimeErrors, []);
  console.log(startOnly ? 'PASS browser localizado: Routine gerada/editada → iniciar treino → snapshots e Workout Live em mobile/desktop.' : 'PASS browser: vazio/manual, frequência/equipamentos, foco, loading/duplo clique, erro preserva inputs, geração real, semana/rotina editáveis, start/snapshots/Workout Live e 390/1280/1920px.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await app.close(); await db.$disconnect(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
