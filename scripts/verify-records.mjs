import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'release', 'win-unpacked', 'FullCourt.exe');
const userData = path.join(root, '.electron-records-test');
const shot = path.join(root, 'screenshots', '46-records-sync.png');
const port = 9334;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const item = [...document.querySelectorAll('.topnav-item')].find((node) => node.textContent.includes('Records'));
          if (item) item.click();
          return Boolean(item);
        })()`,
        returnByValue: true,
      });
      if (result.result.value) break;
      await sleep(500);
    }

    await sleep(2800);

    let state = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(() => ({
          title: document.querySelector('.titlebar-section')?.textContent.trim() || '',
          podium: [...document.querySelectorAll('.record-podium-card')].map((node) => node.innerText.replace(/\\n+/g, ' | ').trim()),
          snapshot: document.querySelector('.records-snapshot')?.innerText.trim() || '',
          note: document.querySelector('.league-source-note')?.innerText.replace(/\\n+/g, ' ').trim() || '',
          syncBadge: document.querySelector('.records-header-mark')?.innerText.trim() || '',
          syncMessage: document.querySelector('.records-sync-message')?.innerText.replace(/\\n+/g, ' ').trim() || '',
          error: document.querySelector('.state-panel--error')?.innerText || ''
        }))()`,
        returnByValue: true,
      });
      state = result.result.value;
      if (state.podium.length || state.error) break;
      await sleep(500);
    }

    console.log(JSON.stringify(state, null, 2));
    if (!state || state.error) throw new Error('Records page failed to render');
    if (!state.podium[1]?.toLowerCase().includes('bam adebayo')) throw new Error('Bam Adebayo is not second');
    if (!state.podium[0]?.includes('100') || !state.podium[2]?.includes('81')) throw new Error('Unexpected podium values');

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(screenshot.data, 'base64'));
    console.log(`screenshot=${shot}`);

    await cdp.send('Runtime.evaluate', { expression: 'window.fullcourt.windowControls.close()' }).catch(() => {});
    cdp.close();
    await sleep(500);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
