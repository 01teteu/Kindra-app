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
import { fixture } from './fixture';

const { app, db, owner, exercise, token, cleanup } = await fixture();
const binary = process.env.EXERCISE_TEST_CHROMIUM ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const browserProfile = mkdtempSync(path.join(os.tmpdir(), 'kindra-live-api-browser-'));
const outputDir = '/tmp/kindra-live-api-browser';
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
  assert.ok(existsSync(binary), 'Defina EXERCISE_TEST_CHROMIUM para um Chromium instalado.');
  app.addHook('onRequest', async req => { if (req.method !== 'GET' && req.url.startsWith('/api/')) writes.push(`${req.method} ${req.url}`); });
  app.addHook('onSend', async (req, _reply, payload) => {
    if (heldPatch && req.method === 'PATCH') {
      const gate = heldPatch; heldPatch = undefined; patchCommitted = true;
      await gate;
    }
    return payload;
  });
  let editorSession: string | undefined;
  if (process.env.WORKOUT_BROWSER_CASE === 'editor') {
    const session = await db.workoutSession.create({ data: { userId: owner.id, name: 'Edição concorrente', exercises: { create: {
      exerciseId: exercise.id, order: 0, sets: { create: [
        { setNumber: 1, type: 'WORKING', weight: 30, reps: 8 },
        { setNumber: 2, type: 'DROP_SET', segments: { create: { order: 0, weight: 20, reps: 6 } } },
      ] },
    } } } });
    editorSession = session.id;
  }
  await app.register(middie);
  vite = await createServer({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: { '@': process.cwd() } },
    server: { middlewareMode: true, hmr: { server: app.server }, watch: null }, appType: 'spa' });
  app.use((req, res, next) => req.url?.startsWith('/api/') ? next() : vite!.middlewares(req, res, next));
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
  if (process.env.WORKOUT_BROWSER_CASE === 'editor') {
    await wait(`document.querySelector('[aria-label="Carga de Série 1 em kg"]') !== null`);
    heldPatch = new Promise<void>(resolve => { releasePatch = resolve; });
    await fill('[aria-label="Carga de Série 1 em kg"]', '35');
    await key('Enter');
    for (let i = 0; i < 100 && !patchCommitted; i++) await delay(50);
    assert.ok(patchCommitted);
    await fill('[aria-label="Carga de Série 1 em kg"]', '30');
    releasePatch!();
    await wait(`!document.body.innerText.includes('Salvando…')`);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Carga de Série 1 em kg"]').value`), '30');
    assert.equal(await evaluate(`document.body.innerText.includes('Há edições ainda não salvas.')`), true);
    await key('Enter');
    await wait(`!document.body.innerText.includes('Salvando…') && !document.body.innerText.includes('Há edições ainda não salvas.')`);
    assert.equal((await db.workoutSet.findFirstOrThrow({ where: { workoutExercise: { sessionId: editorSession }, type: 'WORKING' } })).weight, 30);
    await fill('[aria-label="Carga do segmento 1 de Drop set 2 em kg"]', '');
    await key('Enter');
    await wait(`document.body.innerText.includes('Não salvo.')`);
    await clickText('Atualizar treino');
    await wait(`!document.body.innerText.includes('Atualizando treino…')`);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Carga do segmento 1 de Drop set 2 em kg"]').value`), '');
    assert.equal(await evaluate(`document.body.innerText.includes('Há edições ainda não salvas.')`), true);
    await fill('[aria-label="Carga do segmento 1 de Drop set 2 em kg"]', '22');
    await key('Enter');
    await wait(`!document.body.innerText.includes('Salvando…') && !document.body.innerText.includes('Há edições ainda não salvas.')`);
    assert.deepEqual(runtimeErrors, []);
    console.log('PASS browser focado: edição durante resposta pendente, erro de validação preserva input e GET de recuperação mantém edição não salva.');
  } else {
  await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
  assert.equal(await evaluate(`document.querySelectorAll('.live-exercise').length`), 0);
  assert.equal(await db.workoutSession.count({ where: { userId: owner.id } }), 0);
  if (process.env.WORKOUT_BROWSER_CASE !== 'runtime') {
  await clickText('Iniciar treino');
  await wait(`document.body.innerText.includes('Seu treino ainda não possui exercícios.')`);
  const session = await db.workoutSession.findFirstOrThrow({ where: { userId: owner.id, status: 'ACTIVE' } });
  await clickText('Adicionar exercício');
  await wait(`document.querySelectorAll('.exercise-card').length > 0`);
  await fill('[aria-label="Buscar exercício"]', exercise.name);
  await wait(`document.querySelectorAll('.exercise-card').length === 1`);
  await click('.exercise-card');
  await clickText('Adicionar (1)');
  await wait(`document.querySelectorAll('.live-exercise').length === 1 && !document.querySelector('dialog[open]')`);
  await clickText('Adicionar série');
  await wait(`document.querySelectorAll('.live-set').length === 1`);
  const beforeTyping = writes.length;
  for (const weight of ['3', '32', '32,5']) await fill('[aria-label="Carga de Série 1 em kg"]', weight);
  assert.equal(writes.length, beforeTyping, 'Nenhum PATCH durante digitação');
  await key('Enter');
  await fill('[aria-label="Repetições de Série 1"]', '8');
  await key('Enter');
  await wait(`!document.body.innerText.includes('Salvando…') && !document.body.innerText.includes('Há edições ainda não salvas.')`);
  assert.equal(writes.length, beforeTyping + 2);
  await click('[aria-label="Concluir Série 1"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 1`);
  await fill('select[aria-label^="Tipo da nova série"]', 'WARMUP');
  await clickText('Adicionar série');
  await wait(`document.querySelectorAll('.live-set').length === 2`);
  await fill('[aria-label="Carga de Aquecimento 2 em kg"]', '15');
  await fill('[aria-label="Repetições de Aquecimento 2"]', '12');
  await key('Enter');
  await wait(`!document.body.innerText.includes('Salvando…') && !document.body.innerText.includes('Há edições ainda não salvas.')`);
  await click('[aria-label="Concluir Aquecimento 2"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 2`);
  await fill('select[aria-label^="Tipo da nova série"]', 'DROP_SET');
  await clickText('Adicionar série');
  await wait(`document.querySelectorAll('.live-set').length === 3`);
  for (const weight of ['30', '20']) {
    await clickText('Segmento');
    await fill('[aria-label="Carga do novo segmento de Drop set 3 em kg"]', weight);
    await fill('[aria-label="Repetições do novo segmento de Drop set 3"]', '6');
    await clickText('Salvar segmento');
    await wait(`!document.querySelector('.live-segment-draft') && !document.body.innerText.includes('Salvando…')`);
  }
  await click('[aria-label="Concluir Drop set 3"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 3`);
  await clickText('Adicionar nota');
  const beforeNote = writes.length;
  await fill('textarea', 'Banco no nível 3.');
  assert.equal(writes.length, beforeNote);
  await clickText('Pronto');
  await wait(`document.querySelector('.live-note-saved p')?.textContent === 'Banco no nível 3.'`);
  await click('.live-rest > button');
  await fill('[aria-label="Descanso planejado em segundos"]', '90');
  await clickText('Aplicar a todas');
  await wait(`document.querySelector('.live-rest')?.textContent.includes('01:30') && !document.querySelector('.live-rest-edit')`);
  const snapshot = () => db.workoutSession.findUniqueOrThrow({ where: { id: session.id }, include: {
    exercises: { orderBy: { order: 'asc' }, include: { sets: { orderBy: { setNumber: 'asc' }, include: { segments: { orderBy: { order: 'asc' } } } } } },
  } });
  const beforeRefresh = await snapshot();
  assert.deepEqual(beforeRefresh.exercises[0].sets.map(set => set.type), ['WORKING', 'WARMUP', 'DROP_SET']);
  assert.ok(beforeRefresh.exercises[0].sets.every(set => set.completedAt && set.restTime === 90));
  assert.equal(beforeRefresh.exercises[0].sets[2].segments.length, 2);
  assert.equal(await evaluate(`sessionStorage.getItem('kindra.workout-live.demo.v1')`), null);
  assert.equal(await evaluate(`document.querySelectorAll('.live-previous-note').length`), 0);
  assert.equal(await evaluate(`[...document.querySelectorAll('.live-previous')].every(e => e.textContent.replace('Anterior', '').trim() === '—')`), true);
  console.log('PASS browser: sessão real, catálogo, três tipos, segmentos, notas/descanso e nenhum PATCH por tecla.');
  await send('Page.reload');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 3`);
  assert.deepEqual(await snapshot(), beforeRefresh);
  assert.equal(await evaluate(`document.querySelector('.live-note-saved p').textContent`), 'Banco no nível 3.');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Carga de Série 1 em kg"]').value`), '32,5');
  assert.equal(await evaluate(`document.querySelector('[data-testid="volume"]').textContent.trim()`), '560 kg');
  const displayed = await evaluate<string>(`document.querySelector('.live-header-clock span').textContent`);
  const seconds = displayed.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  assert.ok(Math.abs(seconds - (Date.now() - session.startedAt.getTime()) / 1000) <= 3, 'Timer usa startedAt após refresh');
  for (const [width, height] of [[390, 844], [1366, 900], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await delay(100);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true, `Overflow ${width}`);
    await capture(width === 390 ? 'mobile-390' : width === 1920 ? 'desktop-1920' : 'laptop');
  }
  await click('[aria-label="Reabrir Série 1"]');
  await wait(`document.querySelector('[aria-label="Concluir Série 1"]') !== null`);
  await fill('[aria-label="Carga de Série 1 em kg"]', '35');
  await key('Enter');
  await wait(`!document.body.innerText.includes('Salvando…') && !document.body.innerText.includes('Há edições ainda não salvas.')`);
  await click('[aria-label="Concluir Série 1"]');
  await wait(`document.querySelectorAll('.live-set.is-completed').length === 3`);
  await clickText('Concluir');
  await clickText('Concluir treino');
  await wait(`document.querySelector('.live-finished h1')?.textContent === 'Treino concluído'`);
  const closed = await snapshot();
  assert.equal(closed.status, 'COMPLETED');
  assert.equal(closed.exercises[0].sets[0].weight, 35);
  await send('Page.navigate', { url: `${url}/workout/live` });
  await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
  assert.equal(await db.workoutSession.count({ where: { userId: owner.id, status: 'ACTIVE' } }), 0);
  console.log('PASS browser: refresh integral, timer, mobile/laptop/desktop, reabertura/edição, finish e retorno sem ACTIVE.');
  } else {
    await send('Page.reload');
    await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
    await delay(500);
    await send('Page.navigate', { url: `${url}/workout/live` });
    await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
    await delay(500);
  }
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS browser: inicialização e navegação sem exceções no console.');
  }
} finally {
  releasePatch?.();
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite?.close();
  await cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
