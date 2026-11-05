import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9226);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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

const stateExpression = `(() => {
  const rows = [...document.querySelectorAll('.standings-table tbody tr')].map((row) => row.innerText.split('\\n').map((part) => part.trim()).filter(Boolean));
  const pick = (abbr) => rows.find((row) => row.includes(abbr)) || null;
  return {
    section: document.querySelector('.titlebar-section')?.textContent?.trim() || '',
    feed: document.querySelector('.standings-feed-strip')?.innerText?.split('\\n').map((part) => part.trim()).filter(Boolean) || [],
    updated: [...(document.querySelector('.standings-feed-strip')?.children || [])].map((node) => node.textContent.trim()),
    rowCount: rows.length,
    phi: pick('PHI'),
    hou: pick('HOU'),
    lal: pick('LAL'),
    error: document.querySelector('.state-panel--error')?.innerText?.trim() || ''
  };
})()`;

async function main() {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await sleep(1200);

  let clicked = false;
  for (let attempt = 0; attempt < 30 && !clicked; attempt += 1) {
    clicked = await evaluate(cdp, `(() => {
      const item = [...document.querySelectorAll('.topnav-item')].find((node) => node.textContent.includes('Standings'));
      if (!item) return false;
      item.click();
      return true;
    })()`);
    if (!clicked) await sleep(300);
  }
  if (!clicked) throw new Error('Standings navigation not found');

  let first = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    first = await evaluate(cdp, stateExpression);
    if (first.error || first.rowCount >= 25) break;
    await sleep(500);
  }
  if (first.error) throw new Error(first.error);
  if (first.rowCount < 25) throw new Error(`Expected standings rows, got ${first.rowCount}`);

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/49-standings-live.png', Buffer.from(screenshot.data, 'base64'));

  console.log('FIRST');
  console.log(JSON.stringify(first, null, 2));
  await sleep(65000);
  const second = await evaluate(cdp, stateExpression);
  console.log('AFTER_65S');
  console.log(JSON.stringify(second, null, 2));
  console.log(`polling_updated_changed=${JSON.stringify(first.updated) !== JSON.stringify(second.updated)}`);
  console.log('screenshot=screenshots/49-standings-live.png');
  cdp.close();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
