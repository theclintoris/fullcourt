'use strict';

/**
 * League-page visual smoke test.
 *
 * Basketball Reference is rate-limiting this build machine, so team/player
 * pages use representative fixtures here. Standings and daily leaders still
 * come from the live ESPN endpoints. This is a layout check, not a data check.
 *
 * Usage:
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe \
 *     --no-sandbox --disable-gpu --disable-breakpad \
 *     --user-data-dir="$PWD/.electron-capture" scripts/capture-league.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const {
  ServiceError,
  getScoreboard,
  getGame,
} = require('../electron/nba-service.cjs');
const {
  getStandings,
  getDailyLeaders,
  getTeamStats,
  getPlayerStats,
} = require('../electron/league-service.cjs');

const USE_REAL_LEAGUE_DATA = process.env.FULLCOURT_REAL_LEAGUE === '1';

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');

app.disableHardwareAcceleration();

const CURRENT_SEASON = 2027;

const ERA = {
  1996: { pace: 91.8, ortg: 107.6, drtg: 107.6, tsPct: 54.2, efgPct: 49.7, ftr: 32.9, threePtAr: 20.0, tovPct: 14.8, orbPct: 30.4, ppg: 99.5 },
  2013: { pace: 92.0, ortg: 105.6, drtg: 105.6, tsPct: 53.5, efgPct: 49.0, ftr: 31.0, threePtAr: 27.0, tovPct: 14.3, orbPct: 27.5, ppg: 98.8 },
  2027: { pace: 99.6, ortg: 113.2, drtg: 113.2, tsPct: 57.2, efgPct: 54.1, ftr: 28.6, threePtAr: 42.9, tovPct: 13.9, orbPct: 27.4, ppg: 117.1 },
};

const TEAM_SEED = [
  ['BOS', 'Boston Celtics', 'Boston', 12, 3, 120.4, 109.8, 59.4, 121.6, 108.4],
  ['NYK', 'New York Knicks', 'New York', 11, 4, 117.2, 110.6, 56.9, 117.8, 110.1],
  ['DEN', 'Denver Nuggets', 'Denver', 10, 5, 118.7, 112.7, 57.3, 118.1, 111.9],
  ['OKC', 'Oklahoma City Thunder', 'Oklahoma City', 10, 5, 114.8, 109.3, 55.1, 116.4, 108.7],
  ['LAL', 'Los Angeles Lakers', 'Los Angeles', 9, 6, 116.2, 114.5, 56.5, 115.7, 113.0],
  ['GSW', 'Golden State Warriors', 'Golden State', 8, 7, 115.5, 115.1, 55.7, 115.4, 114.2],
  ['MIA', 'Miami Heat', 'Miami', 7, 8, 110.1, 111.4, 52.8, 111.8, 112.1],
  ['PHI', 'Philadelphia 76ers', 'Philadelphia', 8, 7, 117.9, 116.5, 56.7, 118.0, 115.8],
];

const PLAYER_SEED = {
  1996: [
    ['Michael Jordan', 'CHI', 'Chicago Bulls', 'SG', 104, 30.4, 6.6, 4.3, 2.2, 0.5, 2.4, 58.1, 42.7, 83.5, 29.4, 6.4, 22.2],
    ['Scottie Pippen', 'CHI', 'Chicago Bulls', 'SF', 77, 19.4, 6.4, 5.9, 1.7, 0.7, 2.7, 46.3, 37.4, 67.9, 22.6, 3.4, 20.2],
    ['Dennis Rodman', 'CHI', 'Chicago Bulls', 'PF', 64, 5.5, 14.9, 2.5, 0.6, 0.4, 2.2, 48.0, 11.1, 52.8, 14.0, 2.1, 20.9],
    ['Hakeem Olajuwon', 'HOU', 'Houston Rockets', 'C', 72, 26.9, 10.9, 3.6, 1.6, 2.9, 2.9, 51.4, 21.4, 72.4, 27.8, 4.2, 28.4],
    ['David Robinson', 'SAS', 'San Antonio Spurs', 'C', 82, 25.0, 12.2, 3.0, 1.4, 3.3, 2.4, 51.6, 33.3, 76.1, 28.3, 4.9, 27.5],
    ['John Stockton', 'UTA', 'Utah Jazz', 'PG', 82, 14.7, 2.8, 11.2, 1.7, 0.2, 2.9, 53.8, 42.2, 83.0, 18.7, 4.2, 22.6],
    ['Shaquille O\'Neal', 'ORL', 'Orlando Magic', 'C', 54, 26.6, 11.0, 2.9, 0.6, 2.1, 2.8, 57.3, 0.0, 48.7, 26.3, 3.6, 28.6],
    ['Gary Payton', 'SEA', 'Seattle SuperSonics', 'PG', 81, 20.4, 4.2, 7.5, 2.9, 0.2, 2.4, 48.4, 35.2, 76.7, 20.0, 3.4, 25.7],
    ['Karl Malone', 'UTA', 'Utah Jazz', 'PF', 82, 25.7, 9.8, 4.2, 1.7, 0.7, 2.9, 51.9, 25.3, 72.3, 26.1, 3.8, 27.0],
    ['Reggie Miller', 'IND', 'Indiana Pacers', 'SG', 81, 19.0, 2.7, 3.1, 1.0, 0.2, 1.5, 46.9, 42.7, 91.4, 19.0, 3.1, 21.7],
  ],
  2013: [
    ['LeBron James', 'MIA', 'Miami Heat', 'SF', 76, 26.8, 8.0, 7.3, 1.7, 0.9, 3.0, 56.5, 40.6, 75.3, 27.8, 4.2, 31.6],
    ['Kevin Durant', 'OKC', 'Oklahoma City Thunder', 'SF', 81, 28.1, 7.9, 4.6, 1.4, 1.3, 3.5, 51.0, 41.6, 90.5, 27.3, 5.8, 28.6],
    ['Chris Paul', 'LAC', 'Los Angeles Clippers', 'PG', 70, 16.9, 3.7, 9.7, 2.4, 0.1, 2.3, 48.1, 32.8, 88.5, 20.4, 3.4, 25.9],
    ['Kobe Bryant', 'LAL', 'Los Angeles Lakers', 'SG', 78, 27.3, 5.6, 6.0, 1.4, 0.3, 3.7, 46.3, 32.4, 83.9, 25.8, 3.7, 29.8],
    ['Tim Duncan', 'SAS', 'San Antonio Spurs', 'PF', 69, 17.8, 9.9, 2.7, 0.7, 2.7, 1.7, 50.2, 28.6, 81.7, 21.0, 5.0, 24.4],
    ['Russell Westbrook', 'OKC', 'Oklahoma City Thunder', 'PG', 82, 23.2, 5.2, 7.4, 1.8, 0.3, 3.3, 43.8, 32.3, 80.0, 23.7, 3.0, 28.3],
    ['Carmelo Anthony', 'NYK', 'New York Knicks', 'SF', 67, 28.7, 6.9, 2.6, 0.8, 0.5, 2.6, 44.9, 37.9, 81.9, 26.0, 3.8, 29.4],
    ['James Harden', 'HOU', 'Houston Rockets', 'SG', 78, 25.9, 4.9, 5.8, 1.8, 0.5, 2.9, 43.8, 36.8, 86.5, 24.2, 3.0, 28.0],
    ['Dwight Howard', 'LAL', 'Los Angeles Lakers', 'C', 76, 17.1, 12.4, 1.4, 1.1, 2.4, 3.0, 57.8, 16.7, 49.2, 19.6, 4.1, 24.9],
    ['Tony Parker', 'SAS', 'San Antonio Spurs', 'PG', 66, 20.3, 3.0, 7.6, 0.8, 0.1, 2.2, 52.2, 35.3, 84.5, 22.0, 3.1, 23.5],
  ],
  2027: [
    ['Luka Dončić', 'LAL', 'Los Angeles Lakers', 'SG', 12, 38.3, 9.1, 8.7, 1.8, 0.5, 4.2, 49.4, 38.2, 78.9, 33.4, 8.1, 33.7],
    ['Shai Gilgeous-Alexander', 'OKC', 'Oklahoma City Thunder', 'PG', 13, 32.8, 5.4, 6.1, 2.3, 0.7, 2.8, 52.1, 36.0, 89.2, 26.4, 4.0, 30.1],
    ['Giannis Antetokounmpo', 'MIL', 'Milwaukee Bucks', 'PF', 11, 31.4, 11.8, 5.7, 1.2, 1.1, 3.4, 58.8, 18.2, 62.4, 29.8, 5.6, 31.8],
    ['Nikola Jokić', 'DEN', 'Denver Nuggets', 'C', 13, 29.7, 13.2, 9.4, 1.5, 0.8, 3.9, 57.1, 32.1, 83.6, 31.2, 6.4, 30.4],
    ['Stephen Curry', 'GSW', 'Golden State Warriors', 'PG', 12, 30.0, 4.5, 6.2, 1.3, 0.4, 2.9, 47.2, 42.6, 91.8, 23.0, 3.4, 27.4],
    ['Jayson Tatum', 'BOS', 'Boston Celtics', 'SF', 14, 28.4, 8.9, 4.8, 1.2, 0.7, 2.6, 47.5, 37.1, 86.2, 28.2, 5.1, 28.0],
    ['Joel Embiid', 'PHI', 'Philadelphia 76ers', 'C', 9, 32.1, 12.6, 4.4, 0.9, 1.4, 3.2, 53.8, 32.0, 88.7, 29.3, 5.8, 30.6],
    ['Victor Wembanyama', 'SAS', 'San Antonio Spurs', 'C', 13, 24.6, 11.1, 3.8, 1.2, 3.6, 3.6, 50.1, 34.6, 77.3, 28.6, 5.2, 27.0],
    ['Anthony Edwards', 'MIN', 'Minnesota Timberwolves', 'SG', 12, 27.3, 5.8, 4.4, 1.3, 0.5, 3.2, 46.1, 36.3, 84.1, 24.0, 4.0, 27.3],
    ['Jalen Brunson', 'NYK', 'New York Knicks', 'PG', 15, 26.1, 3.0, 7.4, 1.1, 0.2, 3.4, 48.3, 37.3, 84.2, 24.9, 3.7, 25.5],
  ],
};

function makePlayerTeam(abbr, teamLabel) {
  return {
    id: `${abbr}-${teamLabel.replace(/\s+/g, '-').toLowerCase()}`,
    abbreviation: abbr,
    displayName: teamLabel,
    shortDisplayName: teamLabel.split(' ').at(-1),
    logo: `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`,
  };
}

function playerStatsFor(seasonYear) {
  const era = ERA[seasonYear];
  return {
    seasonYear,
    seasonLabel: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    era,
    players: (PLAYER_SEED[seasonYear] || []).map(([name, abbr, teamLabel, position, games, pts, reb, ast, stl, blk, tov, fgPct, tpPct, ftPct, per100Pts, bpm, usg]) => ({
      id: `${seasonYear}-${abbr}-${name.replace(/\s+/g, '-').toLowerCase()}`,
      name,
      team: abbr,
      teamLabel,
      teamLogo: `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`,
      headshot: null,
      age: seasonYear === 2027 ? 27 : 29,
      position,
      games,
      gamesStarted: Math.max(1, games - 2),
      mpg: 34.2,
      stats: {
        fgm: 9.6, fga: 19.5, fgPct, tpm: 2.9, tpa: 7.9, tpPct, ftm: 6.4, fta: 7.7, ftPct,
        oreb: 1.2, dreb: 6.2, reb, ast, stl, blk, tov, pf: 2.2, pts,
        efgPct: fgPct + 1.4, tsPct: (pts / (2 * (19.5 + 0.44 * 7.7))) * 100,
      },
      advanced: {
        per: 24.8, tsPct: (pts / (2 * (19.5 + 0.44 * 7.7))) * 100, threePtAr: 39.5, ftr: 35.1,
        orbPct: 4.2, drbPct: 18.7, trbPct: 11.4, astPct: 24.3, stlPct: 2.2, blkPct: 1.3,
        tovPct: 13.8, usgPct: usg, ows: 2.8, dws: 1.2, ws: 4.0, ws48: 0.235, obpm: 5.8, dbpm: bpm > 4 ? 1.1 : 0.2, bpm, vorp: 2.1,
      },
      per100: { pts: per100Pts, reb: reb * 2.2, ast: ast * 2.2, stl: stl * 2.2, blk: blk * 2.2, tpm: 2.9 * 2.2, usgPct: usg },
      per100Estimated: false,
    })),
  };
}

function teamStatsFor(seasonYear) {
  const era = ERA[seasonYear] || ERA[CURRENT_SEASON];
  return {
    seasonYear,
    seasonLabel: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    era,
    teams: TEAM_SEED.map(([abbreviation, displayName, shortDisplayName, wins, losses, ppg, oppPpg, tsPct, ortg, drtg]) => ({
      ...makePlayerTeam(abbreviation, displayName),
      shortDisplayName,
      wins,
      losses,
      winPct: wins / (wins + losses),
      record: `${wins}-${losses}`,
      ppg,
      oppPpg,
      diff: ppg - oppPpg,
      mov: ppg - oppPpg,
      srs: ppg - oppPpg + 0.4,
      ortg,
      drtg,
      netRtg: ortg - drtg,
      pace: era.pace,
      ftr: era.ftr,
      threePtAr: era.threePtAr,
      tsPct,
      efgPct: tsPct - 3.4,
      tovPct: era.tovPct,
      orbPct: era.orbPct,
      oppEfgPct: 51.2,
      color: '#f2732c',
      alternateColor: '#111419',
      stats: { reb: 44.8, ast: 27.1, tov: 12.8 },
    })),
  };
}

function fail(error) {
  const known = error instanceof ServiceError;
  console.error('[capture]', error);
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
    const result = await loader();
    const serviceData = result && typeof result === 'object' && 'data' in result ? result.data : result;
    return {
      ok: true,
      data: serviceData,
      meta: {
        fetchedAt: result?.fetchedAt || new Date().toISOString(),
        stale: Boolean(result?.stale),
        warning: result?.warning || null,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

function registerIpc() {
  ipcMain.handle('nba:scoreboard', (_event, payload = {}) => respond(() => getScoreboard(payload.date)));
  ipcMain.handle('nba:game', (_event, payload = {}) => respond(() => getGame(payload.gameId)));
  ipcMain.handle('nba:team-stats', (_event, payload = {}) => {
    const season = Number(payload.seasonYear) || CURRENT_SEASON;
    return respond(() => USE_REAL_LEAGUE_DATA ? getTeamStats(season) : teamStatsFor(season));
  });
  ipcMain.handle('nba:player-stats', (_event, payload = {}) => {
    const season = Number(payload.seasonYear) || CURRENT_SEASON;
    return respond(() => USE_REAL_LEAGUE_DATA ? getPlayerStats(season) : playerStatsFor(season));
  });
  ipcMain.handle('nba:standings', (_event, payload = {}) => respond(() => getStandings(Number(payload.seasonYear) || CURRENT_SEASON)));
  ipcMain.handle('nba:daily-leaders', (_event, payload = {}) => respond(() => getDailyLeaders(payload.date)));
  ipcMain.handle('nba:player', () => ({ ok: false, error: { code: 'DEV_ONLY', message: 'Not available in this capture run.' } }));
  ipcMain.handle('nba:player-games', () => ({ ok: false, error: { code: 'DEV_ONLY', message: 'Not available in this capture run.' } }));
  ipcMain.handle('window:minimize', () => {});
  ipcMain.handle('window:toggle-maximize', () => false);
  ipcMain.handle('window:close', () => {});
  ipcMain.handle('window:is-maximized', () => false);
}

async function waitFor(win, selector, timeout = 30000) {
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

async function waitForSafe(win, selector, timeout = 30000) {
  try {
    await waitFor(win, selector, timeout);
    return true;
  } catch (error) {
    console.warn(`[capture] ${error.message}`);
    return false;
  }
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

async function openNav(win, label, waitSelector) {
  await win.webContents.executeJavaScript(`
    (() => {
      const item = [...document.querySelectorAll('.topnav-item')]
        .find((node) => node.textContent.toLowerCase().includes(${JSON.stringify(label.toLowerCase())}));
      if (!item) throw new Error('Navigation item not found: ${label}');
      item.click();
    })();
  `, true);
  await sleep(500);
  if (waitSelector) {
    const ready = await waitForSafe(win, waitSelector, 45000);
    await sleep(ready ? 800 : 300);
  }
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
  await waitForSafe(win, '.game-center .game-card, .game-center .state-panel', 30000);
  await sleep(1200);
  await capture(win, '11-nav-slate');

  await openNav(win, 'Daily Leaders', '.daily-page');
  await waitForSafe(win, '.daily-leader-row', 45000);
  await capture(win, '12-daily-leaders');

  await openNav(win, 'Stats', '.stats-page');
  await waitForSafe(win, '.stats-table--teams', 15000);
  await capture(win, '13-stats-teams');

  await win.webContents.executeJavaScript(`
    (() => {
      const option = [...document.querySelectorAll('.segmented-option')]
        .find((node) => node.textContent.toLowerCase().includes('player'));
      if (option) option.click();
    })();
  `, true);
  await waitForSafe(win, '.stats-table--players', 15000);
  await capture(win, '14-stats-players');

  const sortCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const headers = [...document.querySelectorAll('.stats-table--players .stat-sort')];
      const rebounds = headers.find((node) => node.textContent.trim().startsWith('RPG'));
      if (!rebounds) return { error: 'RPG header missing' };
      rebounds.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const read = () => {
        const active = document.querySelector('.stats-table--players th[aria-sort="descending"], .stats-table--players th[aria-sort="ascending"]');
        return {
          header: active?.textContent.trim() || null,
          direction: active?.getAttribute('aria-sort') || null,
          first: document.querySelector('.stats-table--players tbody tr .stats-player-cell strong')?.textContent || null,
        };
      };
      const firstClick = read();
      rebounds.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      return { firstClick, secondClick: read() };
    })()
  `, true);
  console.log('[capture] sort check', JSON.stringify(sortCheck));
  await capture(win, '43-stats-sorted');

  await win.webContents.executeJavaScript(`document.querySelector('.stats-table--players tbody tr')?.click();`, true);
  await waitForSafe(win, '.player-season-sheet', 5000);
  await capture(win, '15-player-season-sheet');
  await win.webContents.executeJavaScript(`document.querySelector('.sheet-close')?.click();`, true);

  await openNav(win, 'Standings', '.standings-page');
  await waitForSafe(win, '.standings-table', 30000);
  await capture(win, '16-standings');

  await openNav(win, 'Records', '.records-page');
  await waitForSafe(win, '.records-table', 10000);
  await capture(win, '17-records');

  await win.webContents.executeJavaScript(`
    (() => {
      const scope = [...document.querySelectorAll('.records-scope')]
        .find((node) => node.textContent.toLowerCase().includes('playoffs'));
      if (scope) scope.click();
    })();
  `, true);
  await waitForSafe(win, '.record-subtab', 5000);
  await capture(win, '22-records-playoffs');

  await win.webContents.executeJavaScript(`
    (() => {
      const scope = [...document.querySelectorAll('.records-scope')]
        .find((node) => node.textContent.trim().toLowerCase() === 'team');
      if (scope) scope.click();
    })();
  `, true);
  await waitForSafe(win, '.team-record-card', 5000);
  await capture(win, '23-records-team');

  await openNav(win, 'Era Lab', '.era-page');
  await waitForSafe(win, '.era-slot--filled', 20000);
  await waitForSafe(win, '.era-comparison', 20000);
  await capture(win, '18-era-lab');

  await win.webContents.executeJavaScript(`
    (() => {
      const add = (label) => {
        const button = [...document.querySelectorAll('.era-quickstart')]
          .find((node) => node.textContent.includes(label));
        if (button && !button.disabled) button.click();
      };
      add('Wilt');
      add('Kareem');
    })();
  `, true);
  await waitForSafe(win, '.era-slot:nth-child(4)', 20000);
  await waitForSafe(win, '.era-comparison', 20000);
  await sleep(1000);
  await capture(win, '24-era-four-slots');

  await win.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('.main-panel');
      const table = document.querySelector('.era-comparison');
      if (panel && table) panel.scrollTop = table.offsetTop - 80;
    })();
  `, true);
  await sleep(700);
  await capture(win, '19-era-comparison');

  win.setContentSize(1120, 820);
  await sleep(700);
  await openNav(win, 'Daily Leaders', '.daily-page');
  await waitForSafe(win, '.daily-leader-row', 30000);
  await capture(win, '20-daily-1120');

  win.setContentSize(900, 780);
  await sleep(700);
  await openNav(win, 'Stats', '.stats-page');
  await waitForSafe(win, '.stats-table--teams', 15000);
  await capture(win, '21-stats-900');

  win.close();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error('[capture] failed', error);
  app.exit(1);
});
