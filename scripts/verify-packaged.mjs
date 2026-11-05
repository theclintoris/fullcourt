import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'release', 'win-unpacked', 'FullCourt.exe');
const userData = path.join(root, '.electron-packaged-test');
const shot = path.join(root, 'screenshots', '42-packaged-1.1.1.png');
const port = 9333;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTargets() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('Timed out waiting for the packaged renderer');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          return new Promise((resolveCommand, rejectCommand) => {
            const id = nextId;
            nextId += 1;
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });

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

async function main() {
  if (!fs.existsSync(exe)) throw new Error(`Missing packaged executable: ${exe}`);
  fs.rmSync(userData, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(shot), { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(exe, [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-breakpad',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
  ], { cwd: root, env, stdio: 'ignore' });

  try {
    const target = await waitForTargets();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    let state = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => ({
          title: document.title,
          cards: document.querySelectorAll('.game-card').length,
          live: Boolean(document.querySelector('.live-dot')),
          nav: document.querySelector('.topnav')?.innerText.replace(/\\n+/g, ' ').trim() || '',
          section: document.querySelector('.titlebar-section')?.textContent.trim() || '',
          error: document.querySelector('.state-panel--error')?.innerText || ''
        }))()`,
        returnByValue: true,
      });
      state = result.result.value;
      if (state.cards > 0 || state.error) break;
      await sleep(700);
    }

    console.log(JSON.stringify(state, null, 2));
    if (!state || (!state.cards && !state.error)) {
      throw new Error('Packaged renderer did not finish loading');
    }
    if (state.error) throw new Error(`Packaged renderer error: ${state.error}`);
    if (!state.nav.toLowerCase().includes('daily leaders')) throw new Error('Top navigation did not render');

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(screenshot.data, 'base64'));

    console.log(JSON.stringify({ ...state, screenshot: shot }, null, 2));

    await cdp.send('Runtime.evaluate', {
      expression: 'window.fullcourt.windowControls.close()',
      awaitPromise: false,
    }).catch(() => {});
    cdp.close();
    await sleep(700);
  } finally {
    if (child.exitCode === null) child.kill();
    await sleep(250);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
