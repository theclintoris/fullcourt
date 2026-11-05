import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9225);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json`);
      if (response.ok) {
        const page = (await response.json()).find((item) => item.type === 'page');
        if (page) return page;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('No renderer target');
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

const stateExpression = `(() => ({
  section: document.querySelector('.titlebar-section')?.textContent?.trim() || '',
  rows: document.querySelectorAll('.stats-table tbody tr').length,
  warning: document.querySelector('.stats-fallback-note')?.innerText?.trim() || '',
  cached: document.querySelector('.stats-stale')?.innerText?.trim() || '',
  firstTeam: document.querySelector('.stats-table tbody tr .stats-team-cell')?.innerText?.trim() || '',
  error: document.querySelector('.state-panel--error')?.innerText?.trim() || ''
}))()`;

async function main() {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await sleep(1500);

  let clicked = false;
  for (let attempt = 0; attempt < 30 && !clicked; attempt += 1) {
    clicked = await evaluate(cdp, `(() => {
      const item = [...document.querySelectorAll('.topnav-item')].find((node) => node.textContent.includes('Stats'));
      if (!item) return false;
      item.click();
      return true;
    })()`);
    if (!clicked) await sleep(300);
  }
  if (!clicked) throw new Error('Stats navigation was not found');

  let state = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    state = await evaluate(cdp, stateExpression);
    if (state.error || state.rows >= 25) break;
    await sleep(500);
  }

  console.log(JSON.stringify(state, null, 2));
  if (state.error) throw new Error(state.error);
  if (!state.section.includes('STATS')) throw new Error(`Unexpected section: ${state.section}`);

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('screenshots', { recursive: true });
  fs.writeFileSync('screenshots/48-stats-live.png', Buffer.from(screenshot.data, 'base64'));
  console.log('screenshot=screenshots/48-stats-live.png');
  cdp.close();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
