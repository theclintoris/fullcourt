import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'release', 'win-unpacked', 'FullCourt.exe');
const userData = path.join(root, '.electron-stats-test');
const shot = path.join(root, 'screenshots', '47-stats-fallback.png');
const port = 9335;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const page = (await response.json()).find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('Timed out waiting for renderer');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('open', () => resolve({
      send(method, params = {}) {
        return new Promise((resolveCommand, rejectCommand) => {
          const id = nextId++;
          pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { socket.close(); },
    }));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    socket.addEventListener('error', () => reject(new Error('CDP socket error')));
  });
}

async function click(cdp, selector, text) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.textContent.includes(${JSON.stringify(text)}));
      if (item) item.click();
      return Boolean(item);
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

async function main() {
  fs.rmSync(userData, { recursive: true, force: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [
    '--no-sandbox', '--disable-gpu', '--disable-breakpad',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
  ], { cwd: root, env, stdio: 'ignore' });

  try {
    const target = await waitForTarget();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await click(cdp, '.topnav-item', 'Stats')) break;
      await sleep(250);
    }

    let state = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => ({
          title: document.querySelector('.titlebar-section')?.textContent.trim() || '',
          rows: document.querySelectorAll('.stats-table tbody tr').length,
          warning: document.querySelector('.stats-fallback-note')?.innerText.trim() || '',
          cached: document.querySelector('.stats-stale')?.innerText.trim() || '',
          firstTeam: document.querySelector('.stats-table tbody tr .stats-team-cell')?.innerText.replace(/\\n+/g, ' | ').trim() || '',
          error: document.querySelector('.state-panel--error')?.innerText || ''
        }))()`,
        returnByValue: true,
      });
      state = result.result.value;
      if (state.rows >= 20 || state.error) break;
      await sleep(500);
    }

    if (!state || state.error) throw new Error(`Stats page failed: ${state?.error || 'no data'}`);
    if (state.rows < 20) throw new Error(`Expected team table rows, got ${state.rows}`);
    if (!state.warning.toLowerCase().includes('cached league snapshot')) {
      throw new Error(`Expected fallback warning, got: ${state.warning}`);
    }

    await click(cdp, '.segmented-option', 'Player explorer');
    await sleep(1200);
    const playerState = await cdp.send('Runtime.evaluate', {
      expression: `(() => ({
        rows: document.querySelectorAll('.stats-table--players tbody tr').length,
        warning: document.querySelector('.stats-fallback-note')?.innerText.trim() || '',
        error: document.querySelector('.state-panel--error')?.innerText || ''
      }))()`,
      returnByValue: true,
    });

    console.log(JSON.stringify({ team: state, players: playerState.result.value }, null, 2));
    if (playerState.result.value.rows < 20) throw new Error('Player fallback did not render');

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(screenshot.data, 'base64'));
    console.log(`screenshot=${shot}`);

    await cdp.send('Runtime.evaluate', { expression: 'window.fullcourt.windowControls.close()' }).catch(() => {});
    cdp.close();
    await sleep(400);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
