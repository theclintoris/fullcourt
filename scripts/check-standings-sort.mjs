import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9227);
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

async function clickText(cdp, selector, text) {
  return evaluate(cdp, `(() => {
    const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.textContent.includes(${JSON.stringify(text)}));
    if (!item) return false;
    item.click();
    return true;
  })()`);
}

const readExpression = `(() => {
  const conference = document.querySelectorAll('.standings-conference')[0];
  const second = document.querySelectorAll('.standings-conference')[1];
  if (!conference) {
    return { feed: [], status: '', headers: [], rows: [], west: null, error: '' };
  }
  const headers = [...conference.querySelectorAll('.standings-table thead th')].map((th) => ({
    text: th.innerText.trim(),
    ariaSort: th.getAttribute('aria-sort')
  }));
  const rows = [...conference.querySelectorAll('.standings-table tbody tr')].slice(0, 4).map((tr) => ({
    seed: tr.cells[0].innerText.trim(),
    team: tr.cells[1].innerText.split('\\n').filter(Boolean)[0],
    ppg: tr.cells[6].innerText.trim(),
    opp: tr.cells[7].innerText.trim(),
    diff: tr.cells[8].innerText.trim()
  }));
  const west = second ? {
    first: second.querySelector('.standings-table tbody tr')?.cells[1]?.innerText.split('\\n').filter(Boolean)[0] || '',
    firstPpg: second.querySelector('.standings-table tbody tr')?.cells[6]?.innerText.trim() || ''
  } : null;
  return {
    feed: document.querySelector('.standings-feed-strip')?.innerText.split('\\n').filter(Boolean) || [],
    status: document.querySelector('.standings-sort-status')?.innerText.trim() || '',
    headers,
    rows,
    west,
    error: document.querySelector('.state-panel--error')?.innerText || ''
  };
})()`;

async function main() {
  const target = await getTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await sleep(1200);

  if (!(await clickText(cdp, '.topnav-item', 'Standings'))) throw new Error('Standings navigation not found');
  let initial = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    initial = await evaluate(cdp, readExpression);
    if (initial.error || initial.rows.length) break;
    await sleep(400);
  }
  if (initial.error) throw new Error(initial.error);
  console.log('INITIAL');
  console.log(JSON.stringify(initial, null, 2));

  if (!(await clickText(cdp, '.standings-sort', 'PPG'))) throw new Error('PPG sort button not found');
  await sleep(400);
  const descending = await evaluate(cdp, readExpression);
  console.log('PPG_DESC');
  console.log(JSON.stringify(descending, null, 2));

  await clickText(cdp, '.standings-sort', 'PPG');
  await sleep(400);
  const ascending = await evaluate(cdp, readExpression);
  console.log('PPG_ASC');
  console.log(JSON.stringify(ascending, null, 2));

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/50-standings-sorted.png', Buffer.from(screenshot.data, 'base64'));
  console.log('screenshot=screenshots/50-standings-sorted.png');
  cdp.close();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
