// One representative browser run against the actual frontend, routes and PostgreSQL.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import middie from '@fastify/middie';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createTestDatabase } from '../../../../server/scripts/postgresql-test-db.js';
const database = await createTestDatabase();
const { fixture } = await import('./fixture');

const { app, db, owner, exercise, token, cleanup } = await fixture();
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-live-api-browser-'));
const outputDir = '/tmp/kindra-previous-browser';
mkdirSync(outputDir, { recursive: true });
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
const dialogs: string[] = [];
const acceptDialogs = true;
const writes: string[] = [];
let releasePatch: (() => void) | undefined;
let heldPatch: Promise<void> | undefined;
let patchCommitted = false;
try {
  assert.ok(existsSync(binary), 'Chromium ausente');
  let previousRequests = 0;
  app.addHook('onRequest', async req => { if (req.url.endsWith('/previous-performance')) previousRequests++; });
  const call = async (path: string, payload?: object, method: 'POST' | 'PATCH' = 'POST') => {
    const result = await app.inject({ method, url: `/api/workouts/sessions${path}`, payload, headers: { authorization: `Bearer ${token}` } });
    assert.ok([200, 201].includes(result.statusCode), result.body); return result.json();
  };
  await app.register(middie);
  vite = await createServer({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: { '@': process.cwd() } },
    server: { middlewareMode: true, hmr: { server: app.server }, watch: null }, appType: 'spa' });
  app.use((req, res, next) => req.url?.startsWith('/api/') ? next() : vite!.middlewares(req, res, next));
  // Create and finish a genuine historical execution through production routes.
  const historical = await call('', { name: 'Referência anterior' });
  const added = await call(`/${historical.id}/exercises`, { exerciseId: exercise.id });
  const base = `/${historical.id}/exercises/${added.exercises[0].id}`;
  await call(base, { notes: 'Banco no nível 3.' }, 'PATCH');
  for (const type of ['WORKING', 'WARMUP', 'DROP_SET']) {
    const response = await call(`${base}/sets`, type === 'DROP_SET' ? { type } : { type, weight: type === 'WORKING' ? 30 : 10, reps: 10 });
    const set = response.exercises[0].sets.at(-1);
    if (type === 'DROP_SET') for (const weight of [34, 28, 22]) await call(`${base}/sets/${set.id}/segments`, { weight, reps: 6 });
    await call(`${base}/sets/${set.id}/completion`, { completed: true }, 'PATCH');
  }
  await call(`/${historical.id}/finish`);
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
    if (message.method === 'Page.javascriptDialogOpening') { dialogs.push(message.params.message); void send('Page.handleJavaScriptDialog', { accept:acceptDialogs }); }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
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
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + response.exceptionDetails.exception?.description);
    return response.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 120; i++) { if (await evaluate(`document.body && (${expression})`)) return; await delay(100); }
    throw new Error(`Timeout navegador: ${expression}`);
  }
  async function click(selector: string) {
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await wait(`!document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await key('Enter');
  }
  async function clickText(text: string) {
    await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b) throw Error('Botão ausente'); b.focus(); })()`);
    await key('Enter');
  }
  async function fill(selector: string, value: string) {
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function names() { return evaluate(`[...document.querySelectorAll('.exercise-card-name')].map(e=>e.textContent)`); }
  async function ready() { await wait(`Boolean(document.querySelector('.workout-live'))`); }
  async function capture(name: string) {
    if (!['desktop-1920','mobile-390'].includes(name)) return;
    await delay(150);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${outputDir}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `${url}/workout/live` });
  const refreshOnly = process.env.PREVIOUS_BROWSER_CASE === 'refresh';
  let loadedRequests: number;
  const labels = () => evaluate(`[...document.querySelectorAll('.live-previous-value')].map(e=>e.textContent)`);
  const expected = ['30×10', '10×10', '34×6 › 28×6 › 22×6', '—'];
  if (refreshOnly) {
    const current = await call('', { name: 'Refresh' });
    const added = await call(`/${current.id}/exercises`, { exerciseId: exercise.id });
    for (const type of ['WORKING', 'WARMUP', 'DROP_SET', 'WORKING']) await call(`/${current.id}/exercises/${added.exercises[0].id}/sets`, { type });
    await send('Page.reload');
    await wait(`document.querySelectorAll('.live-previous-value').length === 4 && document.querySelector('.live-previous-note blockquote')?.textContent === 'Banco no nível 3.'`);
    loadedRequests = previousRequests;
  } else {
  await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
  await clickText('Iniciar treino');
  await wait(`document.body.innerText.includes('Seu treino ainda não possui exercícios.')`);
  await clickText('Adicionar exercício');
  await wait(`document.querySelectorAll('.exercise-card').length > 0`);
  await fill('[aria-label="Buscar exercício"]', exercise.name);
  await wait(`document.querySelectorAll('.exercise-card').length === 1`);
  await click('.exercise-card'); await clickText('Adicionar (1)');
  await wait(`document.querySelector('.live-previous-note blockquote')?.textContent === 'Banco no nível 3.'`);
  loadedRequests = previousRequests;
  for (const [index, type] of ['WORKING', 'WARMUP', 'DROP_SET', 'WORKING'].entries()) {
    await fill('select[aria-label^="Tipo da nova série"]', type);
    await clickText('Adicionar série');
    await wait(`document.querySelectorAll('.live-set').length === ${index + 1}`);
  }
  assert.deepEqual(await labels(), expected);
  await fill('[aria-label="Carga de Série 1 em kg"]', '32'); await key('Enter');
  await fill('[aria-label="Repetições de Série 1"]', '10'); await key('Enter');
  await wait(`!document.body.innerText.includes('Há edições ainda não salvas.') && !document.body.innerText.includes('Salvando…')`);
  await click('[aria-label="Concluir Série 1"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 1`);
  assert.equal(previousRequests, loadedRequests);
  for (const width of [390, 1366, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    await capture(width === 390 ? 'mobile-390' : 'desktop-1920');
  }
  }
  await send('Page.reload');
  await wait(`document.querySelectorAll('.live-previous-value').length === 4 && document.querySelector('.live-previous-note blockquote')?.textContent === 'Banco no nível 3.'`);
  assert.deepEqual(await labels(), expected);
  assert.equal(previousRequests, loadedRequests + 1);
  assert.deepEqual(runtimeErrors, []);
  console.log(refreshOnly ? 'PASS navegador: refresh mantém dados e dispara somente um batch.' : 'PASS navegador real: histórico via API, novo treino, ANTERIOR por tipo, nota, série extra, edição/conclusão sem refetch, refresh e 390/1366/1920 sem overflow.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite?.close(); await cleanup(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
