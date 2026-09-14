// One real browser flow, fixtures and mutations confined to a migrated test schema.
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
assert.ok(existsSync(binary));
const database = await createTestDatabase();
const { default: db } = await import('../db.js');
const { workoutRoutes } = await import('../routes/workout.routes.js');
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
let failSave = true; let creates = 0;
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'POST' && req.url === '/api/workouts/routines') {
    creates++;
    if (failSave) { failSave = false; return reply.status(503).send({ error: 'Falha simulada. Tente salvar novamente.' }); }
    await delay(350);
  }
});
await app.register(workoutRoutes, { prefix: '/api/workouts' });
await app.register(serveStatic, { root: path.resolve('dist') });
app.setNotFoundHandler((_, reply) => reply.sendFile('index.html'));
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-builder-browser-'));
let browser: ChildProcess | undefined; let socket: WebSocket | undefined;
try {
  const user = await db.user.create({ data: { email: 'builder-browser@example.test', emailVerified: true } });
  const names = ['Supino', 'Remada', 'Agachamento'];
  const exercises = await Promise.all(names.map((name, i) => db.exercise.create({ data: {
    origin: 'GLOBAL', slug: `builder-browser-${i}`, name, primaryMuscle: 'CHEST', equipment: 'BARBELL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'CHEST', movementPattern: 'PUSH', laterality: 'BILATERAL', instructions: 'Execute com controle.',
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
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function capture(name: string) {
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`/tmp/kindra-builder-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  async function key(key: string, code: string = key) {
    const virtualKey = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === ' ' ? 32 : 9;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  let confirmAnswer = true; let dialogs = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Page.javascriptDialogOpening') { dialogs++; void send('Page.handleJavaScriptDialog', { accept: confirmAnswer }); }
  });
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Fortaleza' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${url}/routines/new` });
  await wait(`document.body.textContent.includes('Nenhum exercício adicionado ainda.')`);
  assert.equal(await db.routine.count({ where: { userId: user.id } }), 0);
  await fill('input[name="routineName"]', 'Treino completo');
  confirmAnswer = false;
  await click('[aria-label="Voltar aos treinos"]');
  assert.equal(await evaluate('location.pathname'), '/routines/new');
  assert.equal(await evaluate(`document.querySelector('input[name="routineName"]').value`), 'Treino completo');
  assert.equal(dialogs, 1); confirmAnswer = true;
  async function add(selectedNames: string[]) {
    await clickText('Adicionar exercício');
    await wait(`document.querySelectorAll('.exercise-card').length===3`);
    for (const name of selectedNames) {
      await fill('input[aria-label="Buscar exercício"]', name);
      await wait(`document.querySelectorAll('.exercise-card').length===1`);
      assert.equal(await evaluate(`document.querySelector('.exercise-card-name').textContent`), name);
      await click('.exercise-card');
    }
    await clickText(`Adicionar (${selectedNames.length})`);
    await wait(`!document.querySelector('dialog[open]')`);
  }
  const order = () => evaluate(`[...document.querySelectorAll('.builder-item h3')].map(e=>e.textContent)`);
  await add(names);
  assert.deepEqual(await order(), names);
  await click('[aria-label="Mover Agachamento para cima"]'); await click('[aria-label="Mover Agachamento para cima"]');
  assert.deepEqual(await order(), ['Agachamento', 'Supino', 'Remada']);
  await click('[aria-label="Remover Remada"]'); assert.deepEqual(await order(), ['Agachamento', 'Supino']);
  await add(['Remada']);
  await fill('.builder-item:nth-child(1) input', '90');
  await fill('.builder-item:nth-child(1) textarea', 'Descer com controle');
  await fill('.builder-item:nth-child(3) input', '0');
  for (const [name, width, height] of [['mobile-390', 390, 844], ['laptop-1280', 1280, 800], ['desktop-1920', 1920, 1080]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await wait('document.documentElement.scrollWidth <= innerWidth');
    assert.equal(await evaluate(`[...document.querySelectorAll('.routine-builder button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)`), true);
    await evaluate('window.scrollTo(0,0)'); await capture(name);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await clickText('Salvar rotina');
  await wait(`document.querySelector('.builder-error')!==null`);
  assert.deepEqual(await order(), ['Agachamento', 'Supino', 'Remada']);
  assert.equal(await evaluate(`document.querySelector('.builder-item textarea').value`), 'Descer com controle');
  await clickText('Salvar rotina');
  await wait(`document.querySelector('.builder-save button').disabled`);
  await clickText('Salvar rotina');
  await wait(`location.pathname==='/workout' && document.body.textContent.includes('Treino completo')`);
  assert.equal(creates, 2); // One failed request and one successful request; no double submit.
  const routine = await db.routine.findFirstOrThrow({ where: { userId: user.id }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.deepEqual(routine.exercises.map(e => [e.exerciseId, e.order, e.restTime]), [[exercises[2].id, 0, 90], [exercises[0].id, 1, null], [exercises[1].id, 2, 0]]);
  assert.equal(routine.exercises[0].notes, 'Descer com controle');
  console.log('PASS browser Builder: rota real, catálogo/busca, 3 exercícios, reorder/remoção, notas/descanso, cancelar saída, erro preserva rascunho, duplo submit e 390/1280/1920px.');

  await clickText('Criar plano'); await fill('input[aria-label="Nome do plano"]', 'Semana'); await clickText('Salvar alterações');
  await wait(`document.querySelectorAll('.weekly-day').length===7`);
  const today = await evaluate(`['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getDay()]`);
  await click(`[data-weekday="${today}"]`);
  await wait(`document.querySelector('dialog[open]')!==null`);
  assert.equal(await evaluate(`document.querySelector('select[aria-label="Treino do dia"]').textContent.includes('Treino completo · 3 exercícios')`), true);
  await fill('select[aria-label="Treino do dia"]', routine.id); await clickText('Salvar alterações');
  await wait(`!document.querySelector('dialog[open]')`);
  await click('.weekly-today button');
  await wait(`location.pathname==='/workout/live' && document.querySelectorAll('.live-exercises > div').length===3`);
  const session = await db.workoutSession.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.deepEqual(session.exercises.map(e => [e.exerciseNameSnapshot, e.order, e.notes, e.restTimeSnapshot]), [
    ['Agachamento', 0, 'Descer com controle', 90], ['Supino', 1, null, null], ['Remada', 2, null, 0],
  ]);
  const rendered = await evaluate(`document.querySelector('.live-exercises').textContent`);
  assert.ok(rendered.indexOf('Agachamento') < rendered.indexOf('Supino') && rendered.indexOf('Supino') < rendered.indexOf('Remada'));
  await capture('live-mobile');
  await click('[aria-label="Sair do treino"]');
  await wait(`location.pathname==='/workout' && document.querySelector('[aria-label="Editar Treino completo"]')!==null`);
  await click('[aria-label="Editar Treino completo"]');
  await wait(`location.pathname==='/routines/${routine.id}/edit' && document.querySelectorAll('.builder-item').length===3`);
  assert.equal(await evaluate(`document.querySelector('.builder-item input').value`), '90');
  await fill('input[name="routineName"]', 'Rotina editada');
  await fill('.builder-item:nth-child(1) input', '120'); await fill('.builder-item:nth-child(1) textarea', 'Nova nota');
  await click('[aria-label="Mover Supino para cima"]'); await click('[aria-label="Remover Remada"]');
  await clickText('Salvar rotina');
  await wait(`location.pathname==='/workout' && document.querySelector('.weekly-today').textContent.includes('Rotina editada')`);
  assert.equal(await evaluate(`document.querySelector('.weekly-today').textContent.includes('2 exercícios')`), true);
  assert.deepEqual(await db.workoutSession.findUniqueOrThrow({ where: { id: session.id }, include: { exercises: { orderBy: { order: 'asc' } } } }), session);
  console.log('PASS browser integração: Routine disponível na semana, start real com ordem/notes/rest snapshots, edição posterior não altera sessão existente.');

  await click('[aria-label="Editar Rotina editada"]'); await wait(`document.querySelectorAll('.builder-item').length===2`);
  await clickText('Excluir rotina');
  await wait(`location.pathname==='/workout' && document.querySelector('.weekly-today').textContent.includes('Hoje é descanso')`);
  assert.equal(await db.routine.count({ where: { id: routine.id } }), 0);
  const afterDelete = await db.workoutSession.findUniqueOrThrow({ where: { id: session.id }, include: { exercises: { orderBy: { order: 'asc' } } } });
  assert.deepEqual(afterDelete.exercises, session.exercises); assert.equal(afterDelete.routineId, null);
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS browser delete: associação vira descanso; sessão e snapshots preservados.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await app.close(); await db.$disconnect(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
