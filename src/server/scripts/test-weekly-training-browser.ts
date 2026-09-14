// One representative browser run, using real endpoints and a migrated isolated schema.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
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
const finishOnly = process.argv.includes('--finish-only');
const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
let failNextDay = false;
app.addHook('onRequest', async (req, reply) => {
  if (failNextDay && req.method === 'PUT' && req.url.includes('/days/')) {
    failNextDay = false; return reply.status(503).send({ error: 'Falha simulada. Tente novamente.' });
  }
});
await app.register(workoutRoutes, { prefix: '/api/workouts' });
await app.register(serveStatic, { root: path.resolve('dist') });
app.setNotFoundHandler((_, reply) => reply.sendFile('index.html'));
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-weekly-browser-'));
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
try {
  const user = await db.user.create({ data: { email: 'weekly-browser@example.test', emailVerified: true } });
  const exercise = await db.exercise.create({ data: { origin: 'GLOBAL', slug: 'browser-supino', name: 'Supino',
    primaryMuscle: 'CHEST', equipment: 'BARBELL', measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [],
    muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Execute com controle.' } });
  const routines = await Promise.all([['Push A', 6], ['Upper', 4]].map(async ([name, count]) => db.routine.create({ data: {
    userId: user.id, name: String(name), exercises: { create: Array.from({ length: Number(count) }, (_, order) => ({ exerciseId: exercise.id, order })) },
  } })));
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
    writeFileSync(`/tmp/kindra-weekly-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  async function key(key: string, code: string = key) {
    const virtualKey = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === ' ' ? 32 : 9;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Fortaleza' });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${url}/workout` });
  await wait(`document.body.textContent.includes('Organize sua semana de treino')`);
  const today = await evaluate(`['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()]`);
  let plan: { id: string; isActive: boolean };
  async function assign(day: string, id: string) {
    await click(`[data-weekday="${day}"]`);
    await wait(`document.querySelector('dialog[open]')!==null`);
    await fill('select[aria-label="Treino do dia"]', id);
    await clickText('Salvar alterações');
    await wait(`!document.querySelector('dialog[open]')`);
  }
  if (!finishOnly) {
  assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: user.id } }), 0);
  assert.equal(await db.workoutSession.count({ where: { userId: user.id } }), 0);
  await capture('empty-mobile');
  await clickText('Criar plano');
  await wait(`document.querySelector('dialog[open]')!==null`);
  assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true);
  await fill('input[aria-label="Nome do plano"]', 'Minha semana');
  await clickText('Salvar alterações');
  await wait(`document.querySelectorAll('.weekly-day').length===7 && !document.querySelector('dialog[open]')`);
  plan = await db.weeklyTrainingPlan.findFirstOrThrow({ where: { userId: user.id } });
  assert.equal(plan.isActive, true);
  assert.equal(await evaluate(`document.querySelectorAll('.weekly-day-content strong').length`), 7);
  assert.equal(await evaluate(`document.querySelector('.weekly-today').textContent.includes('Hoje é descanso')`), true);
  assert.equal(await evaluate(`document.querySelector('.weekly-today button')===null`), true);
  const extra = today === 'TUESDAY' ? 'WEDNESDAY' : 'TUESDAY';
  await assign(today, routines[0].id); await assign(extra, routines[0].id);
  assert.equal(await evaluate(`document.querySelector('.weekly-today').textContent.includes('Push A') && document.querySelector('.weekly-today').textContent.includes('6 exercícios')`), true);
  await assign(extra, routines[1].id);
  assert.equal(await evaluate(`document.querySelector('[data-weekday="${extra}"]').textContent.includes('Upper')`), true);
  await click(`[data-weekday="${extra}"]`); await clickText('Remover treino do dia');
  await wait(`!document.querySelector('dialog[open]')`);
  assert.equal(await evaluate(`document.querySelector('[data-weekday="${extra}"]').textContent.includes('Descanso')`), true);
  assert.equal(await db.weeklyTrainingDay.count({ where: { planId: plan.id, dayOfWeek: extra } }), 0);
  console.log('PASS browser: estado vazio, criação consciente/primeiro ativo, sete dias, descanso, adicionar/trocar/remover e contagem real.');

  failNextDay = true;
  await click(`[data-weekday="${today}"]`); await fill('select[aria-label="Treino do dia"]', routines[1].id); await clickText('Salvar alterações');
  await wait(`document.querySelector('dialog [role="alert"]')!==null`);
  assert.equal(await evaluate(`document.querySelector('.weekly-today').textContent.includes('Push A')`), true);
  await clickText('Salvar alterações'); await wait(`!document.querySelector('dialog[open]')`);
  await assign(today, routines[0].id);
  await click('[aria-label="Renomear plano"]'); await fill('input[aria-label="Nome do plano"]', 'Semana principal'); await clickText('Salvar alterações');
  await wait(`!document.querySelector('dialog[open]')`);
  await clickText('Novo plano'); await fill('input[aria-label="Nome do plano"]', 'Semana alternativa'); await clickText('Salvar alterações');
  await wait(`!document.querySelector('dialog[open]') && document.querySelectorAll('select[aria-label="Plano semanal"] option').length===2`);
  const alternate = await db.weeklyTrainingPlan.findFirstOrThrow({ where: { userId: user.id, name: 'Semana alternativa' } });
  assert.equal(alternate.isActive, false);
  await clickText('Ativar plano'); await wait(`document.querySelector('.weekly-today').textContent.includes('Hoje é descanso')`);
  await fill('select[aria-label="Plano semanal"]', plan.id); await clickText('Ativar plano');
  await wait(`document.querySelector('.weekly-today').textContent.includes('Push A')`);
  assert.equal(await db.weeklyTrainingPlan.count({ where: { userId: user.id, isActive: true } }), 1);
  console.log('PASS browser: erro preserva semana válida, retry, renomear e alternar plano ativo.');

  } else {
    plan = await db.weeklyTrainingPlan.create({ data: { userId: user.id, name: 'Semana principal', source: 'CUSTOM', isActive: true,
      days: { create: { dayOfWeek: today, routineId: routines[0].id } },
    } });
    await send('Page.reload');
    await wait(`document.querySelectorAll('.weekly-day').length===7`);
  }

  if (!finishOnly) {
  for (const [label, width, height] of [['mobile-390', 390, 844], ['laptop-1280', 1280, 800], ['desktop-1920', 1920, 1080]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await wait('document.documentElement.scrollWidth <= innerWidth');
    assert.equal(await evaluate(`[...document.querySelectorAll('.weekly-page button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)`), true);
    await evaluate('window.scrollTo(0,0)'); await capture(label);
  }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click(`[data-weekday="${today}"]`);
  await wait(`document.querySelector('dialog[open]')!==null`);
  await capture('editor-mobile');
  for (let i = 0; i < 6; i++) { await key('Tab'); assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)||document.activeElement===document.body`), true); }
  await key('Escape'); await wait(`!document.querySelector('dialog[open]')`);
  assert.equal(await evaluate(`document.activeElement.dataset.weekday`), today);
  console.log('PASS browser: foco modal, Escape e retorno ao botão de origem.');

  await click('.weekly-today button');
  await wait(`location.pathname==='/workout/live' && document.querySelectorAll('.live-exercises > div').length===6`);
  const session = await db.workoutSession.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.equal(session.routineId, routines[0].id); assert.equal(session.exercises.length, 6);
  await capture('live-mobile');
  // Return through a real navigation; the existing live page owns leave confirmation.
  await send('Page.navigate', { url: `${url}/workout` });
  await wait(`document.querySelectorAll('.weekly-day').length===7`);
  await assign(today, routines[1].id);
  const unchanged = await db.workoutSession.findUniqueOrThrow({ where: { id: session.id }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.deepEqual(unchanged, session);
  await click('.weekly-today button');
  await wait(`location.pathname==='/workout/live' && document.querySelectorAll('.live-exercises > div').length===6`);
  assert.equal(await db.workoutSession.count({ where: { userId: user.id, status: 'ACTIVE' } }), 1);
  assert.equal((await db.workoutSession.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' } })).id, session.id);
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS browser: start real da Routine, Workout Live com snapshots, alteração posterior independente e retomada sem duplicar ACTIVE.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await app.close(); await db.$disconnect(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
