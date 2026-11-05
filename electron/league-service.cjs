'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { ServiceError, getScoreboard, getGame } = require('./nba-service.cjs');

const BBR_ORIGIN = 'https://www.basketball-reference.com';
const FALLBACK_PATH = path.join(__dirname, '..', 'src', 'data', 'league-fallback.json');
let fallbackLeague = null;
const LEAGUE_TIMEOUT_MS = 20000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 FullCourt/1.1';
const MAX_CACHE_ENTRIES = 90;

const cache = new Map();
const inFlight = new Map();

function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = [...cache.entries()]
    .sort((a, b) => a[1].storedAt - b[1].storedAt)
    .slice(0, Math.max(0, cache.size - MAX_CACHE_ENTRIES));
  for (const [key] of oldest) cache.delete(key);
}

async function fetchText(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEAGUE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        throw new ServiceError(
          'That season or stat table is not available from Basketball Reference.',
          'NOT_FOUND',
          404,
        );
      }
      if (status === 429) {
        throw new ServiceError(
          'Basketball Reference is rate limiting requests. Showing the cached league snapshot.',
          'RATE_LIMITED',
          429,
        );
      }
      if (status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        return fetchText(url, attempt + 1);
      }
      throw new ServiceError(
        status === 403
          ? 'Basketball Reference declined the data request. Try again in a minute.'
          : `Basketball Reference returned an error (${status}).`,
        status === 403 ? 'UPSTREAM_BLOCKED' : 'UPSTREAM_STATUS',
        status,
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if ((error.name === 'AbortError' || error.name === 'TimeoutError') && attempt < 1) {
      return fetchText(url, attempt + 1);
    }
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new ServiceError('Basketball Reference took too long to respond.', 'TIMEOUT');
    }
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchText(url, attempt + 1);
    }
    throw new ServiceError(
      'Could not reach Basketball Reference. Check your internet connection and try again.',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }
}

// Basketball Reference starts returning 429s when several season tables are
// requested at once. Keep every page request in one queue with a small gap;
// the cache means this cost is paid once per season.
let bbrQueue = Promise.resolve();
let lastBbrRequestAt = 0;
const BBR_REQUEST_GAP_MS = 550;

function queuedFetchText(url) {
  const task = bbrQueue.then(async () => {
    const wait = BBR_REQUEST_GAP_MS - (Date.now() - lastBbrRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastBbrRequestAt = Date.now();
    return fetchText(url);
  });
  bbrQueue = task.catch(() => {});
  return task;
}

async function cachedFetch(key, ttl, staleFor, loader) {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now - entry.storedAt < ttl) {
    return { data: entry.data, fetchedAt: entry.storedAt, stale: false };
  }
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    try {
      const data = await loader();
      const storedAt = Date.now();
      cache.set(key, { data, storedAt });
      pruneCache();
      return { data, fetchedAt: storedAt, stale: false };
    } catch (error) {
      if (entry && now - entry.storedAt < staleFor) {
        return {
          data: entry.data,
          fetchedAt: entry.storedAt,
          stale: true,
          warning: 'Showing the most recent Basketball Reference data we could load.',
        };
      }
      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

function round(value, places = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '' || value === '--') return null;
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asNumber(value, fallback = 0) {
  return nullableNumber(value) ?? fallback;
}

function percentage(value) {
  const parsed = nullableNumber(value);
  return parsed === null ? null : round(parsed * 100, 1);
}

function currentSeasonYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 8 ? year + 1 : year;
}

function normalizeSeasonYear(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return currentSeasonYear();
  return Math.min(currentSeasonYear(), Math.max(1950, parsed));
}

function seasonLabel(year) {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function getFallbackSeason(year) {
  if (!fallbackLeague) {
    try {
      fallbackLeague = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
    } catch {
      fallbackLeague = { seasons: {} };
    }
  }
  return fallbackLeague.seasons?.[String(year)] || null;
}

function fallbackResult(year, error) {
  const season = getFallbackSeason(year);
  if (!season) return null;
  const warning =
    error?.status === 429
      ? 'Basketball Reference is rate limiting requests. Showing the cached league snapshot from Nov 1, 2026.'
      : 'Live Basketball Reference data is unavailable. Showing the cached league snapshot from Nov 1, 2026.';
  return {
    data: season,
    fetchedAt: fallbackLeague.generatedAt,
    stale: true,
    warning,
  };
}

function cleanName(value) {
  return String(value || '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamLogo(abbreviation) {
  if (!abbreviation || abbreviation === 'TOT') return '';
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation.toLowerCase()}.png`;
}

function teamAbbreviationFromHref(href = '') {
  const match = String(href).match(/\/teams\/([A-Z0-9]{2,4})\//);
  return match ? match[1] : '';
}

function shortTeamName(name = '') {
  const parts = cleanName(name).split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : cleanName(name);
}

function readBbrRow($, row, fields) {
  const values = {};
  for (const field of fields) {
    const raw = $(row).find(`[data-stat="${field}"]`).first().text().trim();
    values[field] = raw;
  }
  return values;
}

function readTeamMeta($, row) {
  const anchor = $(row).find('[data-stat="team"] a').first();
  const href = anchor.attr('href') || '';
  const name = cleanName($(row).find('[data-stat="team"]').first().text());
  const abbreviation = teamAbbreviationFromHref(href);
  return {
    abbreviation,
    name,
    logo: teamLogo(abbreviation),
  };
}

function parseLeaguePage(html, requestedYear) {
  const $ = cheerio.load(html);
  const seasonYear = normalizeSeasonYear(requestedYear);

  const perGameRows = new Map();
  $('#per_game-team tbody tr').each((_index, row) => {
    const meta = readTeamMeta($, row);
    if (!meta.abbreviation) return;
    perGameRows.set(meta.abbreviation, {
      ...meta,
      gp: asNumber($(row).find('[data-stat="g"]').text()),
      mpg: asNumber($(row).find('[data-stat="mp"]').text()),
      fgm: asNumber($(row).find('[data-stat="fg"]').text()),
      fga: asNumber($(row).find('[data-stat="fga"]').text()),
      fgPct: percentage($(row).find('[data-stat="fg_pct"]').text()),
      tpm: asNumber($(row).find('[data-stat="fg3"]').text()),
      tpa: asNumber($(row).find('[data-stat="fg3a"]').text()),
      tpPct: percentage($(row).find('[data-stat="fg3_pct"]').text()),
      ftm: asNumber($(row).find('[data-stat="ft"]').text()),
      fta: asNumber($(row).find('[data-stat="fta"]').text()),
      ftPct: percentage($(row).find('[data-stat="ft_pct"]').text()),
      oreb: asNumber($(row).find('[data-stat="orb"]').text()),
      dreb: asNumber($(row).find('[data-stat="drb"]').text()),
      reb: asNumber($(row).find('[data-stat="trb"]').text()),
      ast: asNumber($(row).find('[data-stat="ast"]').text()),
      stl: asNumber($(row).find('[data-stat="stl"]').text()),
      blk: asNumber($(row).find('[data-stat="blk"]').text()),
      tov: asNumber($(row).find('[data-stat="tov"]').text()),
      pf: asNumber($(row).find('[data-stat="pf"]').text()),
      ppg: asNumber($(row).find('[data-stat="pts"]').text()),
    });
  });

  const advancedRows = new Map();
  $('#advanced-team tbody tr').each((_index, row) => {
    const meta = readTeamMeta($, row);
    if (!meta.abbreviation) return;
    advancedRows.set(meta.abbreviation, {
      wins: asNumber($(row).find('[data-stat="wins"]').text()),
      losses: asNumber($(row).find('[data-stat="losses"]').text()),
      mov: asNumber($(row).find('[data-stat="mov"]').text()),
      srs: asNumber($(row).find('[data-stat="srs"]').text()),
      ortg: asNumber($(row).find('[data-stat="off_rtg"]').text()),
      drtg: asNumber($(row).find('[data-stat="def_rtg"]').text()),
      netRtg: asNumber($(row).find('[data-stat="net_rtg"]').text()),
      pace: asNumber($(row).find('[data-stat="pace"]').text()),
      ftr: percentage($(row).find('[data-stat="fta_per_fga_pct"]').text()),
      threePtAr: percentage($(row).find('[data-stat="fg3a_per_fga_pct"]').text()),
      tsPct: percentage($(row).find('[data-stat="ts_pct"]').text()),
      efgPct: percentage($(row).find('[data-stat="efg_pct"]').text()),
      tovPct: asNumber($(row).find('[data-stat="tov_pct"]').text()),
      orbPct: asNumber($(row).find('[data-stat="orb_pct"]').text()),
      oppEfgPct: percentage($(row).find('[data-stat="opp_efg_pct"]').text()),
    });
  });

  const teams = [];
  for (const [abbreviation, perGame] of perGameRows) {
    const advanced = advancedRows.get(abbreviation) || {};
    const wins = advanced.wins ?? 0;
    const losses = advanced.losses ?? 0;
    const games = wins + losses || perGame.gp;
    teams.push({
      id: abbreviation,
      abbreviation,
      displayName: perGame.name,
      shortDisplayName: shortTeamName(perGame.name),
      logo: perGame.logo,
      color: '#5c6472',
      wins,
      losses,
      gamesPlayed: games,
      winPct: games > 0 ? round(wins / games, 3) : 0,
      record: `${wins}-${losses}`,
      ppg: perGame.ppg,
      oppPpg: null,
      diff: null,
      ...advanced,
      stats: {
        fgm: perGame.fgm,
        fga: perGame.fga,
        fgPct: perGame.fgPct,
        tpm: perGame.tpm,
        tpa: perGame.tpa,
        tpPct: perGame.tpPct,
        ftm: perGame.ftm,
        fta: perGame.fta,
        ftPct: perGame.ftPct,
        oreb: perGame.oreb,
        dreb: perGame.dreb,
        reb: perGame.reb,
        ast: perGame.ast,
        stl: perGame.stl,
        blk: perGame.blk,
        tov: perGame.tov,
        pf: perGame.pf,
        ppg: perGame.ppg,
      },
    });
  }

  const opponentRows = new Map();
  $('#per_game-opponent tbody tr').each((_index, row) => {
    const meta = readTeamMeta($, row);
    if (!meta.abbreviation) return;
    opponentRows.set(meta.abbreviation, asNumber($(row).find('[data-stat="opp_pts"]').text()));
  });

  for (const team of teams) {
    team.oppPpg = opponentRows.get(team.abbreviation) ?? null;
    if (team.oppPpg !== null) team.diff = round(team.ppg - team.oppPpg, 1);
  }

  const avgRow = $('#advanced-team tfoot tr')
    .filter((_index, row) => $('#advanced-team tfoot tr').eq(_index).text().includes('League Average'))
    .first();
  const fallbackAvg = $('#advanced-team tfoot tr').first();
  const leagueRow = avgRow.length ? avgRow : fallbackAvg;

  const leaguePpg =
    asNumber($('#per_game-team tfoot tr').filter((_index, row) =>
      $('#per_game-team tfoot tr').eq(_index).text().includes('League Average'),
    ).first().find('[data-stat="pts"]').text()) || null;

  const era = {
    pace: asNumber($(leagueRow).find('[data-stat="pace"]').text()),
    ortg: asNumber($(leagueRow).find('[data-stat="off_rtg"]').text()),
    drtg: asNumber($(leagueRow).find('[data-stat="def_rtg"]').text()),
    tsPct: percentage($(leagueRow).find('[data-stat="ts_pct"]').text()),
    efgPct: percentage($(leagueRow).find('[data-stat="efg_pct"]').text()),
    ftr: percentage($(leagueRow).find('[data-stat="fta_per_fga_pct"]').text()),
    threePtAr: percentage($(leagueRow).find('[data-stat="fg3a_per_fga_pct"]').text()),
    tovPct: asNumber($(leagueRow).find('[data-stat="tov_pct"]').text()),
    orbPct: asNumber($(leagueRow).find('[data-stat="orb_pct"]').text()),
    ppg: leaguePpg,
  };

  teams.sort((a, b) => b.winPct - a.winPct || b.ppg - a.ppg);

  return { seasonYear, seasonLabel: seasonLabel(seasonYear), era, teams };
}

async function getLeagueBundle(seasonYear) {
  const year = normalizeSeasonYear(seasonYear);
  return cachedFetch(`bbr:league:${year}`, 60 * 60_000, 24 * 60 * 60_000, async () => {
    const html = await queuedFetchText(`${BBR_ORIGIN}/leagues/NBA_${year}.html`);
    return parseLeaguePage(html, year);
  });
}

async function getTeamStats(seasonYear) {
  const year = normalizeSeasonYear(seasonYear);
  try {
    const result = await getLeagueBundle(year);
    return {
      ...result,
      data: {
        seasonYear: result.data.seasonYear,
        seasonLabel: result.data.seasonLabel,
        era: result.data.era,
        teams: result.data.teams,
      },
    };
  } catch (error) {
    if (error?.status === 404) throw error;
    const fallback = fallbackResult(year, error);
    if (fallback) return fallback;
    throw error;
  }
}

function parsePlayerTable(html, tableId, fields) {
  const $ = cheerio.load(html);
  const rows = new Map();
  $(`#${tableId} tbody tr`).each((_index, row) => {
    const playerCell = $(row).find('[data-stat="name_display"]').first();
    if (!playerCell.length) return;
    const anchor = playerCell.find('a').first();
    const href = anchor.attr('href') || '';
    const idMatch = href.match(/\/players\/[a-z]\/([a-z0-9]+)\.html/);
    const name = cleanName(playerCell.text());
    const team = $(row).find('[data-stat="team_name_abbr"]').first().text().trim();
    const id = idMatch?.[1] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const key = `${id}|${team || 'TOT'}`;
    const stats = {};
    for (const field of fields) {
      stats[field] = $(row).find(`[data-stat="${field}"]`).first().text().trim();
    }
    rows.set(key, { id, name, team: team || 'TOT', stats });
  });
  return rows;
}

function betterTotalRow(rows, id) {
  const candidates = [...rows.values()].filter((row) => row.id === id);
  if (!candidates.length) return null;
  return (
    candidates.find((row) => /^\d+TM$/.test(row.team)) ||
    candidates.sort((a, b) => asNumber(b.stats.mp) - asNumber(a.stats.mp))[0]
  );
}

function toPlayerRecord(perGameRow, advancedRow, perPossRow, league) {
  const s = perGameRow.stats;
  const a = advancedRow?.stats || {};
  const p = perPossRow?.stats || {};
  const team = perGameRow.team;
  const displayTeam = /^\d+TM$/.test(team) ? 'TOT' : team;
  const mpg = asNumber(s.mp_per_g);
  const fga = asNumber(s.fga_per_g);
  const fta = asNumber(s.fta_per_g);
  const fgm = asNumber(s.fg_per_g);
  const tpm = asNumber(s.fg3_per_g);
  const pts = asNumber(s.pts_per_g);

  const tsPct =
    percentage(a.ts_pct) ??
    (fga + fta > 0 ? round((pts / (2 * (fga + 0.44 * fta))) * 100, 1) : null);
  const efgPct =
    percentage(s.efg_pct) ??
    (fga > 0 ? round(((fgm + 0.5 * tpm) / fga) * 100, 1) : null);

  let per100 = null;
  let per100Estimated = false;
  if (p.pts_per_poss !== undefined && p.pts_per_poss !== '') {
    per100 = {
      fgm: asNumber(p.fg_per_poss),
      fga: asNumber(p.fga_per_poss),
      tpm: asNumber(p.fg3_per_poss),
      tpa: asNumber(p.fg3a_per_poss),
      ftm: asNumber(p.ft_per_poss),
      fta: asNumber(p.fta_per_poss),
      oreb: asNumber(p.orb_per_poss),
      dreb: asNumber(p.drb_per_poss),
      reb: asNumber(p.trb_per_poss),
      ast: asNumber(p.ast_per_poss),
      stl: asNumber(p.stl_per_poss),
      blk: asNumber(p.blk_per_poss),
      tov: asNumber(p.tov_per_poss),
      pf: asNumber(p.pf_per_poss),
      pts: asNumber(p.pts_per_poss),
      ortg: asNumber(p.off_rtg, null),
      drtg: asNumber(p.def_rtg, null),
    };
  } else if (mpg > 0 && league.era.pace > 0) {
    const possessions = league.era.pace * (mpg / 48);
    if (possessions > 0) {
      const factor = 100 / possessions;
      per100Estimated = true;
      per100 = {
        fgm: round(asNumber(s.fg_per_g) * factor, 1),
        fga: round(asNumber(s.fga_per_g) * factor, 1),
        tpm: round(asNumber(s.fg3_per_g) * factor, 1),
        tpa: round(asNumber(s.fg3a_per_g) * factor, 1),
        ftm: round(asNumber(s.ft_per_g) * factor, 1),
        fta: round(asNumber(s.fta_per_g) * factor, 1),
        oreb: round(asNumber(s.orb_per_g) * factor, 1),
        dreb: round(asNumber(s.drb_per_g) * factor, 1),
        reb: round(asNumber(s.trb_per_g) * factor, 1),
        ast: round(asNumber(s.ast_per_g) * factor, 1),
        stl: round(asNumber(s.stl_per_g) * factor, 1),
        blk: round(asNumber(s.blk_per_g) * factor, 1),
        tov: round(asNumber(s.tov_per_g) * factor, 1),
        pf: round(asNumber(s.pf_per_g) * factor, 1),
        pts: round(pts * factor, 1),
        ortg: null,
        drtg: null,
      };
    }
  }

  return {
    id: perGameRow.id,
    name: perGameRow.name,
    team: displayTeam,
    teamLabel: displayTeam === 'TOT' ? 'Multiple teams' : displayTeam,
    teamLogo: teamLogo(displayTeam),
    age: asNumber(s.age),
    position: s.pos || '',
    games: asNumber(s.games),
    gamesStarted: asNumber(s.games_started),
    mpg: round(mpg, 1),
    stats: {
      fgm: round(asNumber(s.fg_per_g), 1),
      fga: round(fga, 1),
      fgPct: percentage(s.fg_pct),
      tpm: round(tpm, 1),
      tpa: round(asNumber(s.fg3a_per_g), 1),
      tpPct: percentage(s.fg3_pct),
      ftm: round(asNumber(s.ft_per_g), 1),
      fta: round(fta, 1),
      ftPct: percentage(s.ft_pct),
      oreb: round(asNumber(s.orb_per_g), 1),
      dreb: round(asNumber(s.drb_per_g), 1),
      reb: round(asNumber(s.trb_per_g), 1),
      ast: round(asNumber(s.ast_per_g), 1),
      stl: round(asNumber(s.stl_per_g), 1),
      blk: round(asNumber(s.blk_per_g), 1),
      tov: round(asNumber(s.tov_per_g), 1),
      pf: round(asNumber(s.pf_per_g), 1),
      pts: round(pts, 1),
      efgPct,
      tsPct,
    },
    advanced: {
      per: round(asNumber(a.per), 1),
      tsPct: percentage(a.ts_pct),
      threePtAr: percentage(a.fg3a_per_fga_pct),
      ftr: percentage(a.fta_per_fga_pct),
      orbPct: asNumber(a.orb_pct),
      drbPct: asNumber(a.drb_pct),
      trbPct: asNumber(a.trb_pct),
      astPct: asNumber(a.ast_pct),
      stlPct: asNumber(a.stl_pct),
      blkPct: asNumber(a.blk_pct),
      tovPct: asNumber(a.tov_pct),
      usgPct: asNumber(a.usg_pct),
      ows: round(asNumber(a.ows), 1),
      dws: round(asNumber(a.dws), 1),
      ws: round(asNumber(a.ws), 1),
      ws48: round(asNumber(a.ws_per_48), 3),
      obpm: round(asNumber(a.obpm), 1),
      dbpm: round(asNumber(a.dbpm), 1),
      bpm: round(asNumber(a.bpm), 1),
      vorp: round(asNumber(a.vorp), 1),
    },
    per100,
    per100Estimated,
  };
}

function mergePlayerTables(perGameHtml, advancedHtml, perPossHtml, league) {
  const perGameFields = [
    'age',
    'team_name_abbr',
    'pos',
    'games',
    'games_started',
    'mp_per_g',
    'fg_per_g',
    'fga_per_g',
    'fg_pct',
    'fg3_per_g',
    'fg3a_per_g',
    'fg3_pct',
    'ft_per_g',
    'fta_per_g',
    'ft_pct',
    'orb_per_g',
    'drb_per_g',
    'trb_per_g',
    'ast_per_g',
    'stl_per_g',
    'blk_per_g',
    'tov_per_g',
    'pf_per_g',
    'pts_per_g',
    'efg_pct',
  ];
  const advancedFields = [
    'mp',
    'per',
    'ts_pct',
    'fg3a_per_fga_pct',
    'fta_per_fga_pct',
    'orb_pct',
    'drb_pct',
    'trb_pct',
    'ast_pct',
    'stl_pct',
    'blk_pct',
    'tov_pct',
    'usg_pct',
    'ows',
    'dws',
    'ws',
    'ws_per_48',
    'obpm',
    'dbpm',
    'bpm',
    'vorp',
  ];
  const perPossFields = [
    'fg_per_poss',
    'fga_per_poss',
    'fg3_per_poss',
    'fg3a_per_poss',
    'ft_per_poss',
    'fta_per_poss',
    'orb_per_poss',
    'drb_per_poss',
    'trb_per_poss',
    'ast_per_poss',
    'stl_per_poss',
    'blk_per_poss',
    'tov_per_poss',
    'pf_per_poss',
    'pts_per_poss',
    'off_rtg',
    'def_rtg',
  ];

  const perGame = parsePlayerTable(perGameHtml, 'per_game_stats', perGameFields);
  const advanced = advancedHtml
    ? parsePlayerTable(advancedHtml, 'advanced', advancedFields)
    : new Map();
  const perPoss = perPossHtml
    ? parsePlayerTable(perPossHtml, 'per_poss', perPossFields)
    : new Map();

  const ids = [...new Set([...perGame.values()].map((row) => row.id))];
  const players = [];
  for (const id of ids) {
    const row = betterTotalRow(perGame, id);
    if (!row || row.stats.games === '') continue;
    const key = `${id}|${row.team}`;
    const advancedRow = advanced.get(key) || betterTotalRow(advanced, id);
    const perPossRow = perPoss.get(key) || betterTotalRow(perPoss, id);
    players.push(toPlayerRecord(row, advancedRow, perPossRow, league));
  }

  players.sort((a, b) => b.stats.pts - a.stats.pts || a.name.localeCompare(b.name));
  return players;
}

async function getPlayerStats(seasonYear) {
  const year = normalizeSeasonYear(seasonYear);
  try {
    const [bundle, tables] = await Promise.all([
      getLeagueBundle(year),
      cachedFetch(`bbr:players:${year}`, 60 * 60_000, 24 * 60 * 60_000, async () => {
        const urls = [
          `${BBR_ORIGIN}/leagues/NBA_${year}_per_game.html`,
          `${BBR_ORIGIN}/leagues/NBA_${year}_advanced.html`,
          `${BBR_ORIGIN}/leagues/NBA_${year}_per_poss.html`,
        ];
        const [perGame, advanced, perPoss] = await Promise.all(
          urls.map(async (url) => {
            try {
              return await queuedFetchText(url);
            } catch (error) {
              if (error instanceof ServiceError && error.status === 404) return '';
              throw error;
            }
          }),
        );
        return { perGame, advanced, perPoss };
      }),
    ]);

    const players = mergePlayerTables(
      tables.data.perGame,
      tables.data.advanced,
      tables.data.perPoss,
      bundle.data,
    );

    return {
      data: {
        seasonYear: bundle.data.seasonYear,
        seasonLabel: bundle.data.seasonLabel,
        era: bundle.data.era,
        players,
      },
      fetchedAt: Math.max(bundle.fetchedAt, tables.fetchedAt),
      stale: Boolean(bundle.stale || tables.stale),
      warning: bundle.warning || tables.warning || null,
    };
  } catch (error) {
    if (error?.status === 404) throw error;
    const fallback = fallbackResult(year, error);
    if (fallback) return fallback;
    throw error;
  }
}

function statMap(stats = []) {
  const map = {};
  for (const stat of stats) {
    map[stat.name] = {
      value: stat.value ?? null,
      display: stat.displayValue ?? '',
      label: stat.displayName || stat.name,
    };
  }
  return map;
}

function normalizeStandingsTeam(entry) {
  const team = entry.team || {};
  const stats = statMap(entry.stats);
  const wins = stats.wins?.value ?? 0;
  const losses = stats.losses?.value ?? 0;
  return {
    id: String(team.id || ''),
    abbreviation: team.abbreviation || '',
    displayName: team.displayName || team.name || '',
    shortDisplayName: team.shortDisplayName || team.name || '',
    logo: team.logos?.[0]?.href || teamLogo(team.abbreviation || ''),
    color: '#5c6472',
    wins,
    losses,
    winPct: stats.winPercent?.value ?? (wins + losses ? wins / (wins + losses) : 0),
    gamesBehind: stats.gamesBehind?.value ?? 0,
    seed: stats.playoffSeed?.value ?? 0,
    streak: stats.streak?.display || '',
    ppg: stats.avgPointsFor?.value ?? null,
    oppPpg: stats.avgPointsAgainst?.value ?? null,
    diff: stats.differential?.value ?? null,
    pointDiff: stats.pointDifferential?.value ?? null,
    home: stats.Home?.display || '',
    road: stats.Road?.display || '',
    division: stats['vs. Div.']?.display || '',
    conference: stats['vs. Conf.']?.display || '',
    lastTen: stats['Last Ten Games']?.display || '',
    playoffSeed: stats.playoffSeed?.value ?? 0,
  };
}

function parseStandings(raw, requestedYear) {
  const seasonYear = normalizeSeasonYear(requestedYear);
  const conferences = (raw.children || []).map((child) => ({
    id: String(child.id || ''),
    name: child.name || 'Conference',
    abbreviation: child.abbreviation || '',
    teams: (child.standings?.entries || []).map(normalizeStandingsTeam).sort((a, b) => {
      const seedA = a.seed || 99;
      const seedB = b.seed || 99;
      return seedA - seedB || b.wins - a.wins;
    }),
  }));
  return { seasonYear, seasonLabel: seasonLabel(seasonYear), conferences };
}

async function getStandings(seasonYear) {
  const year = normalizeSeasonYear(seasonYear);
  const isCurrent = year === currentSeasonYear();
  return cachedFetch(
    `espn:standings:${year}`,
    isCurrent ? 45_000 : 6 * 60 * 60_000,
    24 * 60 * 60_000,
    async () => {
      const response = await fetch(
        `https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${year}`,
        {
          headers: {
            accept: 'application/json',
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': USER_AGENT,
          },
        },
      );
      if (!response.ok) {
        throw new ServiceError(
          `The standings service returned an error (${response.status}).`,
          'UPSTREAM_STATUS',
          response.status,
        );
      }
      const raw = await response.json();
      return parseStandings(raw, year);
    },
  );
}

function buildDailyLeaders(gameData, board) {
  const players = [];
  const gameById = new Map((board.games || []).map((game) => [String(game.id), game]));

  for (const game of gameData) {
    const boardGame = gameById.get(String(game.id)) || {};
    const teams = {
      [String(game.away.id)]: game.away,
      [String(game.home.id)]: game.home,
    };
    for (const group of game.players || []) {
      const team = teams[String(group.teamId)] || {};
      const opponent =
        String(team.id) === String(game.away.id) ? game.home : game.away;
      const status = boardGame.status || game.status || {};
      for (const athlete of group.athletes || []) {
        if (!athlete.stats || athlete.didNotPlay) continue;
        const stats = athlete.stats;
        if (!(stats.min > 0)) continue;
        const fga = stats.fga || 0;
        const fta = stats.fta || 0;
        const pts = stats.pts || 0;
        const fgPct = fga > 0 ? (stats.fgm / fga) * 100 : null;
        const fantasy =
          pts * 1 +
          (stats.reb || 0) * 1.2 +
          (stats.ast || 0) * 1.5 +
          (stats.stl || 0) * 3 +
          (stats.blk || 0) * 3 +
          (stats.tpm || 0) * 0.5 -
          (stats.tov || 0) * 1;
        players.push({
          ...athlete,
          ...athlete.stats,
          teamId: String(group.teamId),
          teamAbbreviation: team.abbreviation || group.teamAbbreviation || '',
          teamName: team.displayName || group.teamName || '',
          teamLogo: team.logo || group.teamLogo || '',
          teamColor: team.color || '#5c6472',
          opponentAbbreviation: opponent.abbreviation || '',
          opponentName: opponent.displayName || '',
          gameId: String(game.id),
          gameStatus: status.detail || status.shortDetail || '',
          gameState: status.state || '',
          fgPct,
          fantasy: Math.round(fantasy * 10) / 10,
          fta,
          fga,
        });
      }
    }
  }

  const categoryDefs = [
    { id: 'pts', label: 'Points', abbreviation: 'PTS', value: (p) => p.pts, format: 'int' },
    { id: 'reb', label: 'Rebounds', abbreviation: 'REB', value: (p) => p.reb, format: 'int' },
    { id: 'ast', label: 'Assists', abbreviation: 'AST', value: (p) => p.ast, format: 'int' },
    { id: 'stl', label: 'Steals', abbreviation: 'STL', value: (p) => p.stl, format: 'int' },
    { id: 'blk', label: 'Blocks', abbreviation: 'BLK', value: (p) => p.blk, format: 'int' },
    { id: 'tpm', label: 'Threes', abbreviation: '3PM', value: (p) => p.tpm, format: 'int' },
    { id: 'ftm', label: 'Free throws', abbreviation: 'FTM', value: (p) => p.ftm, format: 'int' },
    {
      id: 'fgPct',
      label: 'Field-goal %',
      abbreviation: 'FG%',
      value: (p) => p.fgPct,
      format: 'pct',
      qualifies: (p) => p.fga >= 4,
    },
    {
      id: 'fantasy',
      label: 'Fantasy score',
      abbreviation: 'FPTS',
      value: (p) => p.fantasy,
      format: 'decimal',
    },
    { id: 'tov', label: 'Turnovers', abbreviation: 'TOV', value: (p) => p.tov, format: 'int' },
  ];

  const leaders = {};
  const categories = [];
  for (const category of categoryDefs) {
    const pool = category.qualifies ? players.filter(category.qualifies) : players;
    const sorted = pool
      .filter((player) => {
        const value = category.value(player);
        return Number.isFinite(value) && value > 0;
      })
      .sort((a, b) => category.value(b) - category.value(a))
      .slice(0, 12)
      .map((player, index) => ({
        rank: index + 1,
        id: player.id,
        name: player.name,
        shortName: player.shortName || player.name,
        headshot: player.headshot || '',
        jersey: player.jersey || '',
        position: player.position || '',
        teamId: player.teamId,
        teamAbbreviation: player.teamAbbreviation,
        teamName: player.teamName,
        teamLogo: player.teamLogo,
        teamColor: player.teamColor,
        opponentAbbreviation: player.opponentAbbreviation,
        gameId: player.gameId,
        gameStatus: player.gameStatus,
        gameState: player.gameState,
        value: Math.round(category.value(player) * 10) / 10,
        display:
          category.format === 'pct'
            ? `${category.value(player).toFixed(1)}%`
            : category.format === 'decimal'
              ? category.value(player).toFixed(1)
              : String(Math.round(category.value(player))),
        statLine: {
          pts: player.pts,
          reb: player.reb,
          ast: player.ast,
          stl: player.stl,
          blk: player.blk,
          tpm: player.tpm,
          ftm: player.ftm,
          tov: player.tov,
          fgm: player.fgm,
          fga: player.fga,
          min: player.min,
        },
        fgPct: player.fgPct,
      }));
    leaders[category.id] = sorted;
    categories.push({ id: category.id, label: category.label, abbreviation: category.abbreviation });
  }

  const liveGames = (board.games || []).filter((game) => game.status?.state === 'in').length;
  return {
    date: board.date || '',
    seasonYear: board.seasonYear || null,
    seasonLabel: board.seasonLabel || '',
    gamesCount: gameData.length,
    liveGames,
    playersCount: players.length,
    categories,
    leaders,
  };
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await task(items[index], index);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function getDailyLeaders(date) {
  const safeDate = typeof date === 'string' && /^\d{8}$/.test(date) ? date : '';
  const key = `daily:leaders:${safeDate || 'current'}`;
  return cachedFetch(key, 30_000, 12 * 60_000, async () => {
    const board = await getScoreboard(safeDate);
    const started = (board.data.games || []).filter((game) => game.status?.state !== 'pre');
    const summaries = await mapLimit(started, 6, async (game) => {
      try {
        const summary = await getGame(game.id);
        return summary.data;
      } catch {
        return null;
      }
    });
    return buildDailyLeaders(summaries.filter(Boolean), board.data);
  });
}

module.exports = {
  getTeamStats,
  getPlayerStats,
  getStandings,
  getDailyLeaders,
  buildDailyLeaders,
  _internal: {
    normalizeSeasonYear,
    currentSeasonYear,
    seasonLabel,
    parseLeaguePage,
    parsePlayerTable,
    mergePlayerTables,
    parseStandings,
    buildDailyLeaders,
  },
};
