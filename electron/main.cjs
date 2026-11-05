'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const {
  ServiceError,
  getScoreboard,
  getGame,
  getPlayer,
  getPlayerGames,
} = require('./nba-service.cjs');
const {
  getTeamStats,
  getPlayerStats,
  getStandings,
  getDailyLeaders,
} = require('./league-service.cjs');
const recordsService = require('./records-service.cjs');

const APP_ID = 'com.fullcourt.nba';
const isDevelopment = !app.isPackaged;

let mainWindow = null;
let recordsSyncStarted = false;

app.setAppUserModelId(APP_ID);

function getIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#080a0f',
    title: 'FullCourt',
    icon: getIconPath(),
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDevelopment && process.env.FULLCOURT_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  const sendWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximized-change', mainWindow.isMaximized());
  };

  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('enter-full-screen', sendWindowState);
  mainWindow.on('leave-full-screen', sendWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || '';
    if (url !== currentUrl) event.preventDefault();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const modifier = input.control || input.meta;
    if (modifier && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      mainWindow.webContents.reload();
    } else if (modifier && (input.key === '+' || input.key === '-')) {
      event.preventDefault();
    } else if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  return mainWindow;
}

function assertTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  if (!url.startsWith('file://') && !/^https?:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) {
    throw new ServiceError('Request blocked.', 'UNTRUSTED_SENDER', 403);
  }
}

function toErrorPayload(error) {
  const isKnown = error instanceof ServiceError;
  return {
    ok: false,
    error: {
      code: isKnown ? error.code : 'UNEXPECTED',
      message: isKnown ? error.message : 'Something went wrong while loading NBA data.',
    },
  };
}

async function respond(loader) {
  try {
    const result = await loader();
    return {
      ok: true,
      data: result.data,
      meta: {
        fetchedAt: result.fetchedAt,
        stale: Boolean(result.stale),
        warning: result.warning || null,
      },
    };
  } catch (error) {
    console.error('[FullCourt]', error);
    return toErrorPayload(error);
  }
}

function recordsPayload(result) {
  return {
    ok: true,
    data: result.data,
    meta: {
      fetchedAt: result.fetchedAt || null,
      stale: Boolean(result.stale),
      warning: result.warning || null,
      refreshing: Boolean(result.refreshing),
      lastAttempt: result.lastAttempt || null,
    },
  };
}

function broadcastRecords(payload, channel = 'nba:records-updated') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function startRecordsSync() {
  if (recordsSyncStarted) return;
  recordsSyncStarted = true;
  if (process.env.FULLCOURT_SKIP_RECORDS_SYNC === '1') return;

  recordsService
    .syncOnLaunch(app.getPath('userData'))
    .then((result) => broadcastRecords(recordsPayload(result)))
    .catch((error) => {
      console.error('[FullCourt] Records sync failed:', error);
      broadcastRecords(toErrorPayload(error), 'nba:records-sync-error');
    });
}

ipcMain.handle('nba:scoreboard', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getScoreboard(payload.date));
});

ipcMain.handle('nba:game', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getGame(payload.gameId));
});

ipcMain.handle('nba:player', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getPlayer(payload.playerId, payload.seasonYear));
});

ipcMain.handle('nba:player-games', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getPlayerGames(payload.playerId, payload.seasonYear));
});

ipcMain.handle('nba:team-stats', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getTeamStats(payload.seasonYear));
});

ipcMain.handle('nba:player-stats', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getPlayerStats(payload.seasonYear));
});

ipcMain.handle('nba:standings', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getStandings(payload.seasonYear));
});

ipcMain.handle('nba:daily-leaders', async (event, payload = {}) => {
  assertTrustedSender(event);
  return respond(() => getDailyLeaders(payload.date));
});

ipcMain.handle('nba:records', async (event) => {
  assertTrustedSender(event);
  try {
    return recordsPayload(recordsService.getRecords(app.getPath('userData')));
  } catch (error) {
    console.error('[FullCourt] Records load failed:', error);
    return toErrorPayload(error);
  }
});

ipcMain.handle('nba:refresh-records', async (event) => {
  assertTrustedSender(event);
  try {
    const result = await recordsService.refreshRecords(app.getPath('userData'), { force: true });
    const payload = recordsPayload(result);
    broadcastRecords(payload);
    return payload;
  } catch (error) {
    console.error('[FullCourt] Records refresh failed:', error);
    const payload = toErrorPayload(error);
    broadcastRecords(payload, 'nba:records-sync-error');
    return payload;
  }
});

ipcMain.handle('window:minimize', (event) => {
  assertTrustedSender(event);
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window:toggle-maximize', (event) => {
  assertTrustedSender(event);
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
  return window.isMaximized();
});

ipcMain.handle('window:close', (event) => {
  assertTrustedSender(event);
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('window:is-maximized', (event) => {
  assertTrustedSender(event);
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    createWindow();
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(startRecordsSync, 1200);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
