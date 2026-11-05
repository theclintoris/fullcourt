'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { ServiceError } = require('./nba-service.cjs');

const BBR_BASE = 'https://www.basketball-reference.com/leaders';
const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_GAP_MS = 900;
const FRESH_MS = 8 * 60 * 60 * 1000;
const MAX_ROWS = 25;

const CATEGORIES = [
  { id: 'PTS', label: 'Points', key: 'pts', stat: 'PTS' },
  { id: 'TRB', label: 'Rebounds', key: 'trb', stat: 'TRB' },
  { id: 'AST', label: 'Assists', key: 'ast', stat: 'AST' },
  { id: 'STL', label: 'Steals', key: 'stl', stat: 'STL' },
  { id: 'BLK', label: 'Blocks', key: 'blk', stat: 'BLK' },
  { id: '3P', label: 'Three-pointers', key: 'fg3', stat: '3P' },
  { id: 'TOV', label: 'Turnovers', key: 'tov', stat: 'TOV' },
];

const SCOPES = [
  {
    id: 'singleGame',
    suffix: 'game',
    tableId: (key) => `stats_game_${key}`,
  },
  {
    id: 'singleSeason',
    suffix: 'season',
    tableId: () => 'stats_NBA',
  },
  {
    id: 'career',
    suffix: 'career',
    tableId: () => 'nba',
  },
];

let lastRequestAt = 0;
let inFlight = null;
let activeDirectory = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bundledRecordsPath() {
  return path.join(__dirname, '..', 'src', 'data', 'records.json');
}

function recordsPath(dataDir) {
  return path.join(dataDir, 'records.json');
}

function statePath(dataDir) {
  return path.join(dataDir, 'records-sync.json');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  try {
    fs.renameSync(temporary, file);
  } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(temporary, file);
  }
}

function bundledRecords() {
  return readJson(bundledRecordsPath(), null);
}

function readState(dataDir) {
  return readJson(statePath(dataDir), {});
}

function loadSnapshot(dataDir) {
  return readJson(recordsPath(dataDir), null) || bundledRecords();
}

function isFresh(state) {
  return Boolean(state?.lastSuccess && Date.now() - new Date(state.lastSuccess).getTime() < FRESH_MS);
}

function getRecords(dataDir = activeDirectory) {
  if (!dataDir) throw new ServiceError('Records storage is not configured.', 'RECORDS_UNAVAILABLE');
  const state = readState(dataDir);
  const snapshot = loadSnapshot(dataDir);
  if (!snapshot) {
    throw new ServiceError('No record book data is available.', 'RECORDS_UNAVAILABLE');
  }
  return {
    data: snapshot,
    fetchedAt: state.lastSuccess || snapshot.generatedAt || null,
    stale: !isFresh(state),
    warning: state.error || state.lastError || null,
    refreshing: Boolean(inFlight),
    lastAttempt: state.lastAttempt || null,
  };
}

const REQUEST_HEADERS = {
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const gap = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await sleep(gap);
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: controller.signal,
        redirect: 'follow',
      });
      if (response.ok) return response.text();
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const error = new ServiceError(
          'Basketball Reference is rate limiting requests. Showing the last saved record book.',
          'RATE_LIMITED',
          429,
        );
        error.retryAfterMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 30 * 60 * 1000;
        throw error;
      }
      if (response.status >= 500) {
        lastError = new ServiceError(
          `Basketball Reference returned an error (${response.status}).`,
          'UPSTREAM_ERROR',
          response.status,
        );
        await sleep(5000 * (attempt + 1));
        continue;
      }
      throw new ServiceError(`Basketball Reference returned an error (${response.status}).`, 'UPSTREAM_ERROR', response.status);
    } catch (error) {
      lastError = error;
      if (error instanceof ServiceError && error.code === 'RATE_LIMITED') throw error;
      if (attempt < 2) await sleep(1800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError instanceof ServiceError) throw lastError;
  throw new ServiceError('Could not reach Basketball Reference.', 'NETWORK_ERROR');
}

function normalizePlayer(value) {
  return String(value || '').trim().replace(/\*+$/g, '').trim();
}

function parseNumber(value) {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeason(value, header) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}$/.test(text) && /year/i.test(header)) {
    const endingYear = Number(text);
    return `${endingYear - 1}-${String(endingYear).slice(-2)}`;
  }
  return text;
}

function parseLeaderTable(html, tableId, { scope, stat }) {
  const $ = cheerio.load(html);
  const table = $(`table#${tableId}`).first();
  if (!table.length) return [];
  const headers = table
    .find('thead th')
    .map((_, cell) => $(cell).text().trim())
    .get();
  const indexOf = (...names) =>
    headers.findIndex((header) => names.some((name) => header.toLowerCase() === String(name).toLowerCase()));

  const playerIndex = indexOf('Player');
  const valueIndex = indexOf(stat, stat.replace(/s$/, ''));
  const dateIndex = indexOf('Date');
  const teamIndex = indexOf('Tm', 'Team');
  const seasonIndex = indexOf('Season', 'Year');
  if (playerIndex < 0 || valueIndex < 0) return [];

  const rows = [];
  table.find('tbody tr').each((_, row) => {
    if (rows.length >= MAX_ROWS) return false;
    const cells = $(row).find('td');
    if (!cells.length) return undefined;
    const player = normalizePlayer(cells.eq(playerIndex).text());
    const value = parseNumber(cells.eq(valueIndex).text());
    if (!player || value === null) return undefined;
    const entry = {
      rank: rows.length + 1,
      player,
      value,
    };
    if (scope === 'singleGame') {
      entry.team = cells.eq(teamIndex).text().trim();
      entry.date = cells.eq(dateIndex).text().trim();
    } else if (scope === 'singleSeason') {
      entry.season = normalizeSeason(cells.eq(seasonIndex).text(), headers[seasonIndex] || '');
    }
    rows.push(entry);
    return undefined;
  });
  return rows;
}

function pageDefinition(category, scope, playoffs) {
  const suffix = scope.suffix;
  const playoffSuffix = playoffs ? '_p' : '';
  const tableId = playoffs && scope.id === 'singleGame'
    ? `stats_game_p_${category.key}_p`
    : scope.tableId(category.key);
  return {
    url: `${BBR_BASE}/${category.key}_${suffix}${playoffSuffix}.html`,
    tableId,
    scope: scope.id,
    stat: category.stat,
  };
}

function leaderKey(row, scope) {
  const player = normalizePlayer(row.player).toLowerCase();
  if (scope === 'singleGame') return `${player}|${row.date || row.team || ''}`;
  if (scope === 'singleSeason') return `${player}|${row.season || ''}`;
  return player;
}

function mergeLeaderRows(previousRows, freshRows, scope) {
  const merged = new Map();
  const add = (row) => {
    const value = Number(row?.value);
    const player = normalizePlayer(row?.player);
    if (!player || !Number.isFinite(value)) return;
    const key = leaderKey({ ...row, player }, scope);
    const current = merged.get(key);
    if (!current || value > Number(current.value)) {
      merged.set(key, { ...current, ...row, player, value });
    }
  };
  (Array.isArray(previousRows) ? previousRows : []).forEach(add);
  (Array.isArray(freshRows) ? freshRows : []).forEach(add);
  return [...merged.values()]
    .sort((a, b) => b.value - a.value || String(a.player).localeCompare(String(b.player)))
    .slice(0, MAX_ROWS)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function buildLiveRecords(dataDir) {
  const previous = loadSnapshot(dataDir);
  const regularSeason = {};
  const playoffs = {};

  for (const category of CATEGORIES) {
    regularSeason[category.id] = { label: category.label };
    playoffs[category.id] = { label: category.label };
  }

  for (const category of CATEGORIES) {
    for (const scope of SCOPES) {
      for (const playoff of [false, true]) {
        const definition = pageDefinition(category, scope, playoff);
        const html = await fetchText(definition.url);
        const rows = parseLeaderTable(html, definition.tableId, definition);
        if (!rows.length) {
          throw new ServiceError(
            `The ${category.label} ${scope.id} leaderboard could not be read.`,
            'RECORDS_PARSE_ERROR',
          );
        }
        const prior = (playoff ? previous?.playoffs : previous?.regularSeason)?.[category.id]?.[scope.id] || [];
        (playoff ? playoffs : regularSeason)[category.id][scope.id] = mergeLeaderRows(
          prior,
          rows,
          scope.id,
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    snapshot: 'Live',
    source: 'Basketball Reference all-time leaderboards',
    sourceUrl: 'https://www.basketball-reference.com/leaders/',
    note: 'Regular-season and playoff leaderboards are refreshed from Basketball Reference. Team records are curated.',
    regularSeason,
    playoffs,
    team: previous?.team || [],
  };
}

async function refreshRecords(dataDir, { force = false } = {}) {
  if (!dataDir) throw new ServiceError('Records storage is not configured.', 'RECORDS_UNAVAILABLE');
  if (inFlight) return inFlight;
  const state = readState(dataDir);
  if (!force && isFresh(state) && fs.existsSync(recordsPath(dataDir))) {
    return getRecords(dataDir);
  }

  const task = (async () => {
    try {
      const snapshot = await buildLiveRecords(dataDir);
      writeJsonAtomic(recordsPath(dataDir), snapshot);
      writeJsonAtomic(statePath(dataDir), {
        lastAttempt: new Date().toISOString(),
        lastSuccess: snapshot.generatedAt,
        status: 'ok',
        error: null,
      });
      return {
        ...getRecords(dataDir),
        refreshing: false,
      };
    } catch (error) {
      const retryAfterMs =
        Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0
          ? error.retryAfterMs
          : 30 * 60 * 1000;
      const nextState = {
        ...state,
        lastAttempt: new Date().toISOString(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        retryAfter: new Date(Date.now() + retryAfterMs).toISOString(),
      };
      writeJsonAtomic(statePath(dataDir), nextState);
      throw error;
    }
  })();

  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) inFlight = null;
  }
}

async function syncOnLaunch(dataDir) {
  if (!dataDir) throw new ServiceError('Records storage is not configured.', 'RECORDS_UNAVAILABLE');
  activeDirectory = dataDir;
  const state = readState(dataDir);
  if (isFresh(state) && fs.existsSync(recordsPath(dataDir))) {
    return getRecords(dataDir);
  }
  if (state.retryAfter && new Date(state.retryAfter).getTime() > Date.now()) {
    return getRecords(dataDir);
  }
  return refreshRecords(dataDir);
}

module.exports = {
  CATEGORIES,
  FRESH_MS,
  getRecords,
  refreshRecords,
  syncOnLaunch,
  _internal: {
    parseLeaderTable,
    normalizeSeason,
    normalizePlayer,
    pageDefinition,
    mergeLeaderRows,
  },
};
