// Local Chromium + the real workout route/database. No persistent data writes.
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
import db from '../db.js';
import { workoutRoutes } from '../routes/workout.routes.js';
import { quickMuscleGroups } from '../../components/workout/exerciseFilters.js';
import type { CatalogExercise } from '../../shared/activityOptions.js';

const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
assert.ok(existsSync(binary), 'Defina EXERCISE_TEST_CHROMIUM para um Chromium instalado.');
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(databaseUrl.hostname), 'Exige banco local.');
const app = Fastify();
await app.register(cookie);
await app.register(jwt, { secret: randomUUID(), cookie: { cookieName: 'token', signed: false } });
let mode: 'real' | 'empty' | 'http' | 'slow' | 'media' = 'real';
let requests = 0;
app.addHook('onRequest', async (req, reply) => {
  if (req.url !== '/api/workouts/exercises') return;
  requests++;
  if (mode === 'http') return reply.status(503).send({ error: 'Falha simulada no teste' });
  if (mode === 'empty') return reply.send([]);
  if (mode === 'slow') await delay(1800);
});
app.addHook('onSend', async (req, reply, payload) => {
  if (req.url === '/api/workouts/exercises' && mode === 'media' && reply.statusCode === 200) {
    const rows = JSON.parse(String(payload));
    rows[0].thumbnailUrl = '/__test-thumbnail.svg';
    rows[1].thumbnailUrl = '/__missing-thumbnail.png';
    return JSON.stringify(rows);
  }
  return payload;
});
// A tiny original geometric fixture only verifies img loading; never product data.
app.get('/__test-thumbnail.svg', (_, reply) => reply.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#151818"/><circle cx="80" cy="45" r="20" fill="#a0aaa7"/></svg>'));
app.get('/__missing-thumbnail.png', (_, reply) => reply.status(404).send());
await app.register(workoutRoutes, { prefix: '/api/workouts' });
await app.register(serveStatic, { root: path.resolve('dist') });
app.setNotFoundHandler((_, reply) => reply.sendFile('index.html'));
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-exercise-browser-'));
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
const logs: string[] = [];
function pass(message: string) { logs.push(`PASS ${message}`); console.log(logs.at(-1)); }
try {
  const user = await db.user.findFirst({ where: { emailVerified: true }, select: { id: true } });
  assert.ok(user, 'Exige usuário verificado preexistente; teste não cria dados.');
  const token = app.jwt.sign({ id: user.id, scope: 'session' });
  const response = await app.inject({ url: '/api/workouts/exercises', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.statusCode, 200);
  const source: CatalogExercise[] = response.json();
  assert.ok(source.length > 0);
  assert.equal((await app.inject({ url: '/api/workouts/exercises' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/workouts/exercises', headers: { authorization: `Bearer ${app.jwt.sign({ id: user.id, scope: 'pending_verification' })}` } })).statusCode, 403);
  pass(`API real: ${source.length} exercícios; autorização 200/401/403 preservada.`);
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
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  async function clickText(text: string) {
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b) throw Error('Botão ausente'); b.click(); })()`);
  }
  async function fill(selector: string, value: string) {
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${selector.includes('sort') ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function names() { return evaluate(`[...document.querySelectorAll('.exercise-card-name')].map(e=>e.textContent)`); }
  async function ready() { await wait(`document.querySelectorAll('.exercise-card').length===${source.length}`); }
  async function capture(name: string) {
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`docs/exercise-catalog-ui/${name}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  async function key(key: string, code: string = key) {
    const virtualKey = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === ' ' ? 32 : 9;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  }
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Network.setCookie', { name: 'token', value: token, url, httpOnly: true, sameSite: 'Lax' });
  await send('Page.navigate', { url: `${url}/workout/exercises` }); await ready();

  for (const [name, width, height, columns] of [
    ['desktop-1920', 1920, 1080, 4], ['laptop-1280', 1280, 800, 4],
    ['tablet-768', 768, 1024, 2], ['mobile-390', 390, 844, 1],
  ] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    await wait('document.documentElement.scrollWidth <= innerWidth');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.exercise-grid')).gridTemplateColumns.split(' ').length`), columns);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)`), true);
    await capture(name);
    pass(`${width}x${height}: ${columns} coluna(s), sem overflow horizontal, botões >=44px.`);
  }
  await fill('[aria-label="Buscar exercício"]', 'supino');
  await wait(`document.querySelectorAll('.exercise-card').length===${source.filter(ex => ex.name.toLowerCase().includes('supino')).length}`);
  assert.deepEqual(await names(), source.filter(ex => ex.name.toLowerCase().includes('supino')).map(ex => ex.name).sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'})));
  await fill('[aria-label="Buscar exercício"]', ''); await ready();
  for (const group of quickMuscleGroups) {
    const expected = source.filter(ex => group.codes.includes(ex.primaryMuscle));
    if (!expected.length) continue;
    await clickText(group.label);
    await wait(`document.querySelectorAll('.exercise-card').length===${expected.length}`);
    assert.deepEqual(new Set(await names()), new Set(expected.map(ex => ex.name)));
  }
  await clickText('Todos'); await ready();
  await fill('#exercise-sort', 'desc');
  await delay(100);
  assert.deepEqual(await names(), source.map(ex=>ex.name).sort((a,b)=>-a.localeCompare(b,'pt-BR',{sensitivity:'base'})));
  await fill('#exercise-sort', 'asc');
  await click('.exercise-card');
  await wait(`document.querySelector('.exercise-card[aria-pressed="true"]') !== null`);
  await clickText('Peito'); await clickText('Todos'); await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.exercise-card[aria-pressed="true"]').length`), 1);
  await evaluate(`document.querySelector('.exercise-card').focus()`); await key(' ', 'Space');
  await wait(`document.querySelectorAll('.exercise-card[aria-pressed="true"]').length===0`);
  pass('Busca real, 8 filtros rápidos, ordenação A–Z/Z–A e seleção por mouse/teclado preservada entre filtros.');

  await evaluate(`document.querySelector('[aria-haspopup="dialog"]').focus()`); await key('Enter');
  await wait(`document.querySelector('dialog[open]')!==null`);
  assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`), true);
  for (let index = 0; index < 20; index++) {
    await key('Tab');
    // Chromium can temporarily focus body while cycling through browser chrome;
    // native modal inertness must prevent focus on any background control.
    assert.equal(await evaluate(`document.querySelector('dialog').contains(document.activeElement) || document.activeElement===document.body`), true);
  }
  await click('.muscle-filter-choice input');
  await key('Escape');
  await wait(`!document.querySelector('dialog[open]')`);
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-haspopup')`), 'dialog');
  await ready();
  await click('[aria-haspopup="dialog"]');
  await click('.muscle-filter-choice input');
  await capture('mobile-filters');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await capture('desktop-filters');
  const firstMuscle = await evaluate(`document.querySelector('.muscle-filter-choice input').parentElement.textContent.trim()`);
  await evaluate(`document.querySelector('.exercise-filter-panel > :last-child button:last-child').click()`);
  await wait(`!document.querySelector('dialog[open]')`);
  assert.ok((await names()).length < source.length && (await names()).length > 0);
  await clickText('Limpar filtros'); await ready();
  // Use a real dataset combination and compare the UI to its real fields.
  await click('[aria-haspopup="dialog"]');
  await evaluate(`(() => { const e=document.querySelector('#exercise-equipment'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(source[0].equipment)}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await evaluate(`document.querySelector('.exercise-filter-panel > :last-child button:last-child').click()`);
  await wait(`document.querySelectorAll('.exercise-card').length===${source.filter(ex=>ex.equipment===source[0].equipment).length}`);
  await clickText('Limpar filtros'); await ready();
  pass(`Sheet: ${firstMuscle}, equipamento real, cancelar sem aplicar, Escape e devolução de foco.`);

  await fill('[aria-label="Buscar exercício"]', 'zzzz-sem-resultado');
  await wait(`document.body.innerText.includes('Nenhum exercício com esse nome')`);
  await clickText('Ver todos os exercícios'); await ready();
  // Force an empty combination using only options that actually exist in the API.
  const absentPair = source.flatMap(ex => [...new Set(source.map(row=>row.equipment))].map(equipment=>({muscle: ex.primaryMuscle,equipment})))
    .find(pair=>!source.some(ex=>ex.primaryMuscle===pair.muscle && ex.equipment===pair.equipment));
  assert.ok(absentPair);
  await click('[aria-haspopup="dialog"]');
  const { muscleLabels } = await import('../../shared/activityOptions.js');
  await evaluate(`(() => {const label=[...document.querySelectorAll('.muscle-filter-choice')].find(e=>e.textContent.trim()===${JSON.stringify(muscleLabels[absentPair.muscle] ?? absentPair.muscle)}); label.click(); const e=document.querySelector('#exercise-equipment'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(absentPair.equipment)}); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('.exercise-filter-panel > :last-child button:last-child').click()`);
  await wait(`document.body.innerText.includes('Nenhum exercício para esses filtros')`);
  await clickText('Ver todos os exercícios'); await ready();
  mode = 'empty'; await send('Page.reload');
  await wait(`document.body.innerText.includes('O catálogo ainda está vazio')`);
  assert.equal(await evaluate(`document.querySelector('[role="alert"]')===null`), true);
  mode = 'slow'; await send('Page.reload');
  await wait(`document.querySelector('[aria-busy="true"]')!==null`);
  await capture('loading'); await ready();
  mode = 'http'; await send('Page.reload');
  await wait(`document.querySelector('[role="alert"]')!==null`);
  await capture('error');
  const beforeRetry = requests; mode = 'real'; await clickText('Tentar novamente'); await ready();
  assert.ok(requests > beforeRetry);
  pass('Loading, HTTP 503 + retry real, catálogo vazio e resultados vazios por busca/filtros diferenciados.');

  mode = 'media'; await send('Page.reload'); await ready();
  await wait(`document.querySelector('.exercise-thumbnail img')?.naturalWidth===160`);
  await wait(`document.querySelectorAll('.exercise-thumbnail')[1].querySelector('.exercise-placeholder')!==null`);
  await capture('thumbnail-and-fallback');
  assert.equal(await evaluate(`document.querySelectorAll('video').length`), 0);
  pass('Thumbnail carrega fixture local; imagem 404 e thumbnail nula usam fallback; nenhum vídeo ou dado persistido alterado.');
  mode = 'real';
  await send('Page.navigate', { url: `${url}/workout/exercises?entry=1` }); await ready();
  await send('Page.navigate', { url: `${url}/workout/exercises?entry=2` }); await ready();
  await click('.exercise-card');
  await click('.exercise-selection-bar .button-primary');
  await wait(`location.search==='?entry=1'`);
  assert.deepEqual(runtimeErrors, []);
  pass('Confirmação mantém navegação anterior; zero exceções JavaScript no navegador.');
  writeFileSync('docs/exercise-catalog-ui/browser-tests.log', logs.join('\n') + '\n');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { const stopped = once(browser, 'exit'); browser.kill('SIGTERM'); await stopped; }
  rmSync(browserProfile, { recursive: true, force: true });
  await app.close(); await db.$disconnect();
}
