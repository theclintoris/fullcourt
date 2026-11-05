'use strict';

/**
 * Visual smoke test. Loads the production renderer in Electron, waits for the
 * ESPN-backed UI to settle, and captures the primary screens for review.
 *
 * Usage: npx electron scripts/capture.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const {
  ServiceError,
  getScoreboard,
  getGame,
  getPlayer,
  getPlayerGames,
} = require('../electron/nba-service.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');

app.disableHardwareAcceleration();

function wrap(result) {
  return {
    ok: true,
    data: result.data,
    meta: {
      fetchedAt: result.fetchedAt,
      stale: Boolean(result.stale),
      warning: result.warning || null,
    },
  };
}

function fail(error) {
  const known = error instanceof ServiceError;
  return {
    ok: false,
    error: {
      code: known ? error.code : 'UNEXPECTED',
      message: known ? error.message : 'Something went wrong while loading NBA data.',
    },
  };
}

async function respond(loader) {
  try {
    return wrap(await loader());
  } catch (error) {
    console.error('[capture]', error);
    return fail(error);
  }
}

function registerIpc() {
  ipcMain.handle('nba:scoreboard', (_event, payload = {}) => respond(() => getScoreboard(payload.date)));
  ipcMain.handle('nba:game', (_event, payload = {}) => respond(() => getGame(payload.gameId)));
  ipcMain.handle('nba:player', (_event, payload = {}) => respond(() => getPlayer(payload.playerId, payload.seasonYear)));
  ipcMain.handle('nba:player-games', (_event, payload = {}) => respond(() => getPlayerGames(payload.playerId, payload.seasonYear)));
  ipcMain.handle('window:minimize', () => {});
  ipcMain.handle('window:toggle-maximize', () => false);
  ipcMain.handle('window:close', () => {});
  ipcMain.handle('window:is-maximized', () => false);
}

async function waitFor(win, selector, timeout = 25000) {
  return win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + ${timeout};
    const tick = () => {
      if (document.querySelector(${JSON.stringify(selector)})) return resolve(true);
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for ${selector}'));
      setTimeout(tick, 180);
    };
    tick();
  })`, true);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture(win, name) {
  await sleep(700);
  const image = await win.webContents.capturePage();
  const target = path.join(OUT, `${name}.png`);
  fs.writeFileSync(target, image.toPNG());
  console.log(`[capture] ${target}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  registerIpc();

  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    show: true,
    frame: false,
    backgroundColor: '#080a0f',
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await waitFor(win, '.game-center .game-card, .game-center .state-panel, .spotlight-game');
  await sleep(1800);
  await capture(win, '01-slate');

  await win.webContents.executeJavaScript(`
    const game = document.querySelector('.spotlight-game') || document.querySelector('.game-card');
    if (game) game.click();
  `);
  await waitFor(win, '.game-detail .game-hero');
  await sleep(2600);
  await capture(win, '02-game-detail');

  await win.webContents.executeJavaScript(`
    (() => {
      const tab = [...document.querySelectorAll('.tab')].find((node) => node.textContent.includes('Team stats'));
      if (tab) tab.click();
    })();
  `);
  await sleep(700);
  await capture(win, '03-team-stats');

  await win.webContents.executeJavaScript(`
    (() => {
      const tab = [...document.querySelectorAll('.tab')].find((node) => node.textContent.includes('Play-by-play'));
      if (tab) tab.click();
    })();
  `);
  await waitFor(win, '.pbp, .game-detail .state-panel');
  await sleep(900);
  await capture(win, '04-play-by-play');

  await win.webContents.executeJavaScript(`
    (() => {
      const tab = [...document.querySelectorAll('.tab')].find((node) => node.textContent.includes('Box score'));
      if (tab) tab.click();
    })();
  `);
  await waitFor(win, '.box-row');
  await sleep(700);
  await win.webContents.executeJavaScript(`
    (() => {
      const option = [...document.querySelectorAll('.segmented-option')].find((node) => node.textContent.trim() === 'Advanced');
      if (option) option.click();
    })();
  `);
  await sleep(900);
  await capture(win, '05-box-advanced');
  await win.webContents.executeJavaScript(`document.querySelector('.box-row')?.click();`);
  await waitFor(win, '.player-drawer .drawer-identity');
  await sleep(2800);
  await capture(win, '06-player-drawer');

  await win.webContents.executeJavaScript(`
    (() => {
      const body = document.querySelector('.drawer-body');
      if (body) body.scrollTop = body.scrollHeight;
    })();
  `);
  await sleep(700);
  await capture(win, '07-player-drawer-details');

  await win.webContents.executeJavaScript(`document.querySelector('.drawer-close')?.click();`);
  await sleep(500);
  await win.webContents.executeJavaScript(`document.querySelector('.back-button')?.click();`);
  await waitFor(win, '.game-center');
  await sleep(1000);

  const openedFinal = await win.webContents.executeJavaScript(`
    (() => {
      const card = [...document.querySelectorAll('.game-card')]
        .find((node) => /\\bFinal\\b/.test(node.innerText));
      if (!card) return false;
      card.click();
      return true;
    })();
  `);
  if (openedFinal) {
    await waitFor(win, '.game-hero');
    await sleep(2200);
    await capture(win, '08-final-detail');
    await win.webContents.executeJavaScript(`document.querySelector('.back-button')?.click();`);
    await waitFor(win, '.game-center');
    await sleep(900);
  }

  const openedUpcoming = await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('.game-card--upcoming');
      if (!card) return false;
      card.click();
      return true;
    })();
  `);
  if (openedUpcoming) {
    await waitFor(win, '.game-hero');
    await sleep(2200);
    await capture(win, '09-upcoming-detail');
  }

  win.close();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error('[capture] failed', error);
  app.exit(1);
});
