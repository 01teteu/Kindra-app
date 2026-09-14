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
const outputDir = '/tmp/kindra-completion-browser';
mkdirSync(outputDir, { recursive: true });
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
const dialogs: string[] = [];
const acceptDialogs = true;
let holdRecords = false;
let releaseRecords: (() => void) | undefined;
let recordsGate: Promise<void> | undefined;
const completions: any[] = [];
let finished: any;
try {
  assert.ok(existsSync(binary), 'Chromium ausente');
  let recordRequests = 0;
  app.addHook('onRequest', async req => { if (req.url.endsWith('/personal-records')) { recordRequests++; if (holdRecords) await recordsGate; } });
  const call = async (path: string, payload?: object, method: 'POST' | 'PATCH' = 'POST') => {
    const result = await app.inject({ method, url: `/api/workouts/sessions${path}`, payload, headers: { authorization: `Bearer ${token}` } });
    assert.ok([200, 201].includes(result.statusCode), result.body); return result.json();
  };
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.endsWith('/completion') && reply.statusCode === 200) completions.push(JSON.parse(String(payload)));
    if (req.url.endsWith('/finish') && reply.statusCode === 200) finished = JSON.parse(String(payload));
    return payload;
  });
  const otherExercise = await db.exercise.create({ data: {
    origin: 'CUSTOM', userId: owner.id, slug: 'completion-other', name: 'Remada resumo', primaryMuscle: 'BACK', equipment: 'BARBELL',
    measurementType: 'WEIGHT_REPS', aliases: [], secondaryMuscles: [], muscleRegion: 'BACK', movementPattern: 'PULL',
    laterality: 'BILATERAL', instructions: 'Execute com controle.',
  } });
  await app.register(middie);
  vite = await createServer({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: { '@': process.cwd() } },
    server: { middlewareMode: true, hmr: { server: app.server }, watch: null }, appType: 'spa' });
  app.use((req, res, next) => req.url?.startsWith('/api/') ? next() : vite!.middlewares(req, res, next));
  // Historical baseline created entirely through real production routes.
  const historical = await call('', { name: 'Baseline PR' });
  const added = await call(`/${historical.id}/exercises`, { exerciseId: exercise.id });
  const base = `/${historical.id}/exercises/${added.exercises[0].id}/sets`;
  const created = await call(base, { weight: 100, reps: 1 });
  const response = await call(`${base}/${created.exercises[0].sets[0].id}/completion`, { completed: true }, 'PATCH');
  assert.equal(response.achievement, null);
  await call(`/${historical.id}/finish`);
  await db.workoutSession.update({ where: { id: historical.id }, data: { startedAt: new Date(Date.now() - 120 * 60000), endedAt: new Date(Date.now() - 60 * 60000) } });
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
  async function capture(name: string) {
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
  await wait(`document.body.innerText.includes('Seu treino ainda não foi iniciado.')`);
  await fill('[aria-label="Nome do treino"]', 'Push A');
  await clickText('Iniciar treino');
  await wait(`document.body.innerText.includes('Seu treino ainda não possui exercícios.')`);
  await clickText('Adicionar exercício');
  await wait(`document.querySelectorAll('.exercise-card').length > 0`);
  await fill('[aria-label="Buscar exercício"]', exercise.name);
  await wait(`document.querySelectorAll('.exercise-card').length === 1`);
  await click('.exercise-card'); await clickText('Adicionar (1)');
  await wait(`Boolean(document.querySelector('select[aria-label^="Tipo da nova série"]'))`);
  const goldRows = () => evaluate<number[]>(`[...document.querySelectorAll('.live-set')].flatMap((row,i)=>row.classList.contains('is-pr')?[i+1]:[])`);
  const saved = () => wait(`!document.body.innerText.includes('Há edições ainda não salvas.') && !document.body.innerText.includes('Salvando…')`);

  for (const [index, weight] of [99, 105, 110].entries()) {
    await clickText('Adicionar série');
    await wait(`document.querySelectorAll('.live-set').length === ${index + 1}`);
    await fill(`[aria-label="Carga de Série ${index + 1} em kg"]`, String(weight)); await key('Enter'); await saved();
    await fill(`[aria-label="Repetições de Série ${index + 1}"]`, '1'); await key('Enter'); await saved();
    if (index === 1) { holdRecords = true; recordsGate = new Promise(resolve => { releaseRecords = resolve; }); }
    await click(`[aria-label="Concluir Série ${index + 1}"]`);
    await wait(`document.querySelectorAll('.live-set.is-completed').length === ${index + 1}`); await saved();
    assert.equal(completions.at(-1).achievement?.currentValue ?? null, index === 0 ? null : weight);
    assert.deepEqual(await goldRows(), index === 0 ? [] : index === 1 ? [2] : [2,3]);
    if (index === 1) {
      const evidence = await evaluate<any>(`(() => {
        const row=document.querySelector('.live-set.is-pr');
        let fiber=row[Object.keys(row).find(k=>k.startsWith('__reactFiber$'))];
        while(fiber && !fiber.memoizedProps?.store) fiber=fiber.return;
        const records=fiber.memoizedProps.store.getSnapshot().personalRecords;
        const pr=row.querySelector('.live-pr'), label=pr.querySelector('strong'), value=pr.querySelector('span');
        const rect=pr.getBoundingClientRect(), css=getComputedStyle(label || pr);
        return {records, text:pr.textContent, font:parseFloat(css.fontSize), weight:Number(css.fontWeight),
          color:css.color, visible:css.visibility, width:rect.width, height:rect.height, top:rect.top, bottom:rect.bottom,
          stacked:label && value && value.getBoundingClientRect().top >= label.getBoundingClientRect().bottom};
      })()`);
      assert.deepEqual(Object.values(evidence.records), [completions.at(-1).achievement]);
      // Regression: the old caption computed to 11px and had no separate title/value.
      assert.ok(evidence.font >= 14 && evidence.weight >= 600, JSON.stringify(evidence));
      assert.ok(evidence.stacked && evidence.height >= 40 && evidence.width > 0);
      assert.equal(evidence.visible, 'visible'); // Theme-dependent gold contrast is checked by personal-records-browser.
      assert.ok(evidence.top >= 0 && evidence.bottom <= 844);
      console.log('PASS HTTP achievement → store → SetRow perceptível, antes da resposta de reconstrução.');
      await capture('live-mobile-390');
      holdRecords = false; releaseRecords!();
    }
  }
  await click('[aria-label="Reabrir Série 2"]');
  await wait(`!document.querySelectorAll('.live-set')[1].classList.contains('is-pr')`);
  await send('Page.reload');
  await wait(`document.querySelectorAll('.live-set').length === 3 && document.querySelectorAll('.live-pr').length === 1`);
  assert.deepEqual(await goldRows(), [3]);
  await click('[aria-label="Concluir Série 2"]'); await saved();
  assert.equal(completions.at(-1).achievement, null); assert.deepEqual(await goldRows(), [3]);
  await clickText('Adicionar exercício');
  await wait(`Boolean(document.querySelector('[aria-label="Buscar exercício"]'))`);
  await fill('[aria-label="Buscar exercício"]', otherExercise.name);
  await wait(`document.querySelectorAll('.exercise-card').length === 1`);
  await click('.exercise-card'); await clickText('Adicionar (1)');
  await wait(`document.querySelectorAll('.live-exercise').length === 2`);
  const current = await db.workoutSession.findFirstOrThrow({ where: { userId: owner.id, status: 'ACTIVE' }, include: { exercises: { orderBy: { order: 'asc' } } } });
  const extraBase = `/${current.id}/exercises/${current.exercises[1].id}/sets`;
  await call(extraBase, { type: 'WARMUP', weight: 10, reps: 10 });
  const drop = await call(extraBase, { type: 'DROP_SET' });
  const dropId = drop.exercises[1].sets.at(-1).id;
  for (const weight of [40,30,20]) await call(`${extraBase}/${dropId}/segments`, { weight, reps: 8 });
  await call(extraBase, { weight: 50, reps: 5 }); // unfinished WORKING must not count
  await send('Page.reload');
  await wait(`document.querySelectorAll('.live-set').length === 6`);
  await evaluate(`document.querySelectorAll('.live-set')[3].querySelector('.live-complete').focus()`); await key('Enter'); await saved();
  await evaluate(`document.querySelectorAll('.live-set')[4].querySelector('.live-complete').focus()`); await key('Enter'); await saved();
  assert.equal(completions.at(-1).achievement, null);
  assert.equal(await evaluate(`document.querySelectorAll('.live-set.is-completed').length`), 5);
  // Persisted timestamps, not the local timer. This write is confined to the isolated fixture.
  await db.workoutSession.update({ where: { id: current.id }, data: { startedAt: new Date(Date.now() - 47 * 60000) } });
  await db.exercise.update({ where: { id: exercise.id }, data: { name: 'Catálogo renomeado' } });
  await clickText('Concluir');
  await wait(`Boolean(document.querySelector('dialog[open]'))`);
  await clickText('Concluir treino');
  await wait(`Boolean(document.querySelector('.live-completion')) && !document.body.innerText.includes('Carregando recordes')`);
  assert.equal(finished.status, 'COMPLETED');
  assert.equal(await evaluate(`document.querySelector('.live-completion-name h2').textContent`), 'Push A');
  assert.equal(Math.floor((Date.parse(finished.endedAt) - Date.parse(finished.startedAt)) / 60000), 47);
  assert.equal(await evaluate(`document.querySelector('[data-testid="completed-duration"]').textContent`), '47 min');
  assert.equal(await evaluate(`document.querySelector('[data-testid="completed-exercises"]').textContent`), '2');
  assert.equal(await evaluate(`document.querySelector('[data-testid="completed-sets"]').textContent`), '5');
  assert.equal(await evaluate(`document.querySelectorAll('.live-completion-records li').length`), 1);
  assert.equal(await evaluate(`document.querySelector('.live-completion-records h3').textContent`), exercise.name);
  assert.ok(await evaluate(`document.querySelector('.live-completion-records').textContent.includes('e1RM 110 kg')`));
  assert.equal(await evaluate(`document.body.innerText.includes('Volume') || document.body.innerText.includes('séries principais')`), false);
  for (const width of [390, 1366, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
    await evaluate(`document.querySelector('.live-completion-close').focus()`);
    assert.equal(await evaluate(`document.activeElement.matches('.live-completion-close')`), true);
    if (width !== 1366) await capture(`summary-${width}`);
  }
  await click('.live-completion-close'); await wait(`location.pathname === '/workout'`);
  // Reuse fixture for zero PR and discard; no second historical setup.
  const quiet = await call('', { name: 'Sem recordes' });
  const quietEx = await call(`/${quiet.id}/exercises`, { exerciseId: exercise.id });
  const quietBase = `/${quiet.id}/exercises/${quietEx.exercises[0].id}/sets`;
  const quietSet = await call(quietBase, { weight: 50, reps: 1 });
  await call(`${quietBase}/${quietSet.exercises[0].sets[0].id}/completion`, { completed: true }, 'PATCH');
  await send('Page.navigate', { url: `${url}/workout/live` });
  await wait(`Boolean(document.querySelector('.live-set.is-completed'))`);
  await clickText('Concluir'); await wait(`Boolean(document.querySelector('dialog[open]'))`); await clickText('Concluir treino');
  await wait(`Boolean(document.querySelector('.live-completion')) && !document.body.innerText.includes('Carregando recordes')`);
  assert.equal(await evaluate(`Boolean(document.querySelector('.live-completion-records'))`), false);
  await click('.live-completion-close'); await wait(`location.pathname === '/workout'`);
  await call('', { name: 'Descartar' });
  await send('Page.navigate', { url: `${url}/workout/live` });
  await wait(`Boolean(document.querySelector('.live-discard'))`); await click('.live-discard');
  await wait(`document.body.innerText.includes('Treino descartado')`);
  assert.equal(await evaluate(`Boolean(document.querySelector('.live-completion'))`), false);
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS resumo real: nome, 47 min persistidos, 2 exercícios, 5 séries (WARMUP/DROP), snapshot, melhor PR, zero PR, discard, saída /workout, 390/1366/1920.');
} finally {
  releaseRecords?.();
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await once(browser, 'exit'); }
  await vite?.close(); await cleanup(); await database.cleanup();
  rmSync(browserProfile, { recursive: true, force: true });
}
