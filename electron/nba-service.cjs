'use strict';

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const ATHLETE_URL = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 FullCourt/1.0';

class ServiceError extends Error {
  constructor(message, code = 'UPSTREAM_ERROR', status = 0) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

const cache = new Map();
const inFlight = new Map();
const MAX_CACHE_ENTRIES = 120;

function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = [...cache.entries()]
    .sort((a, b) => a[1].storedAt - b[1].storedAt)
    .slice(0, Math.max(0, cache.size - MAX_CACHE_ENTRIES));
  for (const [key] of oldest) cache.delete(key);
}

async function fetchJson(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      const status = response.status;
      if ((status === 429 || status >= 500) && attempt < 1) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        return fetchJson(url, attempt + 1);
      }
      throw new ServiceError(
        status === 429
          ? 'The live data service is rate limiting requests. Give it a moment, then refresh.'
          : `The NBA data service returned an error (${status}).`,
        status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_STATUS',
        status,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if ((error.name === 'AbortError' || error.name === 'TimeoutError') && attempt < 1) {
      return fetchJson(url, attempt + 1);
    }
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new ServiceError('The NBA data service took too long to respond.', 'TIMEOUT');
    }
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchJson(url, attempt + 1);
    }
    throw new ServiceError(
      'Could not reach the NBA data service. Check your internet connection and try again.',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function cachedFetch(key, ttl, staleFor, loader) {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now - entry.storedAt < ttl) {
    return { data: entry.data, fetchedAt: entry.storedAt, stale: false };
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

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
          warning: 'Showing the most recent data we could load.',
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

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '' || value === '--') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitMadeAttempted(value) {
  if (typeof value !== 'string') return [null, null];
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!match) return [null, null];
  return [asNumber(match[1]), asNumber(match[2])];
}

function minutesToNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text || text === '--' || text === 'DNP') return null;
  if (text.includes(':')) {
    const [minutes, seconds] = text.split(':').map((part) => asNumber(part));
    return minutes + seconds / 60;
  }
  return asNumber(text);
}

function normalizeColor(value) {
  if (!value || typeof value !== 'string') return '#5c6472';
  const clean = value.replace('#', '').trim();
  return /^[0-9a-f]{3,8}$/i.test(clean) ? `#${clean}` : '#5c6472';
}

function pickLogo(team = {}) {
  if (team.logo) return team.logo;
  const logos = Array.isArray(team.logos) ? team.logos : [];
  const preferred =
    logos.find((logo) => logo.rel?.includes('scoreboard')) ||
    logos.find((logo) => logo.rel?.includes('default')) ||
    logos[0];
  if (preferred?.href) return preferred.href;
  if (team.abbreviation) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbreviation.toLowerCase()}.png`;
  }
  return '';
}

function normalizeRecord(competitor = {}) {
  const records = Array.isArray(competitor.records)
    ? competitor.records
    : Array.isArray(competitor.record)
      ? competitor.record
      : [];
  const overall =
    records.find((item) => item.type === 'total') ||
    records.find((item) => item.name === 'overall') ||
    records[0];
  if (overall?.summary) return overall.summary;
  return null;
}

function normalizeTeam(team = {}) {
  return {
    id: String(team.id || ''),
    abbreviation: team.abbreviation || '',
    displayName: team.displayName || team.name || 'NBA',
    shortDisplayName: team.shortDisplayName || team.name || team.abbreviation || 'NBA',
    name: team.name || team.shortDisplayName || '',
    location: team.location || '',
    logo: pickLogo(team),
    color: normalizeColor(team.color),
    alternateColor: normalizeColor(team.alternateColor),
    slug: team.slug || '',
  };
}

function normalizeStatus(status = {}) {
  const type = status.type || {};
  const state = type.state || (type.completed ? 'post' : 'pre');
  return {
    state,
    detail: type.detail || type.shortDetail || (state === 'in' ? 'In progress' : state === 'post' ? 'Final' : 'Scheduled'),
    shortDetail: type.shortDetail || type.detail || '',
    description: type.description || '',
    clock: status.displayClock || '',
    period: Number(status.period) || 0,
    completed: Boolean(type.completed),
  };
}

function normalizeCompetitor(competitor = {}, status = {}) {
  const state = status.state || 'pre';
  const scoreValue = competitor.score;
  let score = null;
  if (state !== 'pre') {
    if (scoreValue && typeof scoreValue === 'object') {
      score = nullableNumber(scoreValue.value ?? scoreValue.displayValue);
    } else {
      score = nullableNumber(scoreValue);
    }
  }

  return {
    ...normalizeTeam(competitor.team || {}),
    score,
    record: normalizeRecord(competitor),
    winner: Boolean(competitor.winner),
    homeAway: competitor.homeAway || '',
    linescores: (competitor.linescores || []).map((line) => ({
      period: Number(line.period) || 0,
      value: nullableNumber(line.value ?? line.displayValue) ?? 0,
    })),
  };
}

function normalizeBroadcast(competition = {}, summaryBroadcasts = []) {
  const names = [];
  if (Array.isArray(competition.broadcasts)) {
    for (const item of competition.broadcasts) {
      if (Array.isArray(item.names)) names.push(...item.names);
    }
  }
  if (competition.broadcast && typeof competition.broadcast === 'string') {
    names.push(competition.broadcast);
  }
  for (const item of summaryBroadcasts || []) {
    if (item?.name) names.push(item.name);
    if (Array.isArray(item?.names)) names.push(...item.names);
  }
  return [...new Set(names.filter(Boolean))].join(', ');
}

function normalizeOdds(rawOdds) {
  const odds = Array.isArray(rawOdds) ? rawOdds[0] : null;
  if (!odds) return null;
  const details = odds.details || null;
  const overUnder = nullableNumber(odds.overUnder);
  if (!details && !overUnder) return null;
  return {
    details,
    overUnder,
    provider: odds.provider?.name || '',
  };
}

function normalizeScoreboard(raw) {
  const league = raw?.leagues?.[0] || {};
  const season = league.season || {};
  const seasonYear = Number(season.year) || new Date().getUTCFullYear();
  const dayDate = raw?.day?.date || '';
  const events = Array.isArray(raw?.events) ? raw.events : [];

  const games = events.map((event) => {
    const competition = event.competitions?.[0] || {};
    const status = normalizeStatus(event.status || competition.status);
    const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
    const away = competitors.find((item) => item.homeAway === 'away') || competitors[0] || {};
    const home = competitors.find((item) => item.homeAway === 'home') || competitors[1] || competitors[0] || {};
    const normalizedAway = normalizeCompetitor(away, status);
    const normalizedHome = normalizeCompetitor(home, status);

    return {
      id: String(event.id || competition.id || ''),
      date: event.date || competition.date || '',
      name: event.name || `${normalizedAway.displayName} at ${normalizedHome.displayName}`,
      shortName: event.shortName || `${normalizedAway.abbreviation} @ ${normalizedHome.abbreviation}`,
      status,
      seasonYear,
      venue: competition.venue?.fullName || '',
      broadcast: normalizeBroadcast(competition, event.broadcasts),
      odds: normalizeOdds(competition.odds),
      away: normalizedAway,
      home: normalizedHome,
    };
  });

  return {
    date: dayDate,
    seasonYear,
    seasonLabel: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    seasonType: season.type?.name || 'Regular Season',
    games,
  };
}

function normalizePlayerStatLine(labels, values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const statMap = {};
  labels.forEach((label, index) => {
    statMap[label] = values[index];
  });

  const [fgm, fga] = splitMadeAttempted(statMap.FG);
  const [tpm, tpa] = splitMadeAttempted(statMap['3PT']);
  const [ftm, fta] = splitMadeAttempted(statMap.FT);
  const plusMinusRaw = statMap['+/-'];
  const plusMinus = plusMinusRaw === undefined ? null : nullableNumber(String(plusMinusRaw).replace('+', ''));

  return {
    min: minutesToNumber(statMap.MIN),
    pts: asNumber(statMap.PTS),
    fgm,
    fga,
    tpm,
    tpa,
    ftm,
    fta,
    reb: asNumber(statMap.REB),
    ast: asNumber(statMap.AST),
    tov: asNumber(statMap.TO),
    stl: asNumber(statMap.STL),
    blk: asNumber(statMap.BLK),
    oreb: asNumber(statMap.OREB),
    dreb: asNumber(statMap.DREB),
    pf: asNumber(statMap.PF),
    plusMinus,
    fg: statMap.FG || '0-0',
    threePt: statMap['3PT'] || '0-0',
    ft: statMap.FT || '0-0',
  };
}

function normalizeTeamStats(statistics = []) {
  const display = [];
  const values = {};

  for (const stat of statistics) {
    const name = stat.name;
    const displayValue = stat.displayValue ?? '';
    display.push({
      name,
      label: stat.label || name,
      abbreviation: stat.abbreviation || stat.label || name,
      displayValue,
    });

    if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
      const [made, attempted] = splitMadeAttempted(displayValue);
      values.fgm = made;
      values.fga = attempted;
    } else if (name === 'threePointFieldGoalsMade-threePointFieldAttempted' || name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
      const [made, attempted] = splitMadeAttempted(displayValue);
      values.tpm = made;
      values.tpa = attempted;
    } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
      const [made, attempted] = splitMadeAttempted(displayValue);
      values.ftm = made;
      values.fta = attempted;
    } else if (name === 'totalRebounds') {
      values.reb = asNumber(displayValue);
    } else if (name === 'offensiveRebounds') {
      values.oreb = asNumber(displayValue);
    } else if (name === 'defensiveRebounds') {
      values.dreb = asNumber(displayValue);
    } else if (name === 'assists') {
      values.ast = asNumber(displayValue);
    } else if (name === 'steals') {
      values.stl = asNumber(displayValue);
    } else if (name === 'blocks') {
      values.blk = asNumber(displayValue);
    } else if (name === 'turnovers') {
      values.tov = asNumber(displayValue);
    } else if (name === 'teamTurnovers') {
      values.teamTov = asNumber(displayValue);
    } else if (name === 'totalTurnovers') {
      values.totalTov = asNumber(displayValue);
    } else if (name === 'fouls') {
      values.pf = asNumber(displayValue);
    } else if (name === 'pointsInPaint') {
      values.paint = asNumber(displayValue);
    } else if (name === 'fastBreakPoints') {
      values.fastBreak = asNumber(displayValue);
    } else if (name === 'largestLead') {
      values.largestLead = asNumber(displayValue);
    } else if (name === 'leadChanges') {
      values.leadChanges = asNumber(displayValue);
    } else if (name === 'turnoverPoints') {
      values.turnoverPoints = asNumber(displayValue);
    } else if (name === 'fieldGoalPct') {
      values.fgPct = asNumber(displayValue);
    } else if (name === 'threePointFieldGoalPct') {
      values.tpPct = asNumber(displayValue);
    } else if (name === 'freeThrowPct') {
      values.ftPct = asNumber(displayValue);
    }
  }

  values.tov = values.totalTov ?? values.tov ?? values.teamTov ?? 0;
  return { display, values };
}

function normalizeSummary(raw) {
  const header = raw?.header || {};
  const competition = header.competitions?.[0] || {};
  const status = normalizeStatus(competition.status);
  const seasonYear = Number(header.season?.year) || new Date().getUTCFullYear();
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const awayRaw = competitors.find((item) => item.homeAway === 'away') || competitors[0] || {};
  const homeRaw = competitors.find((item) => item.homeAway === 'home') || competitors[1] || competitors[0] || {};
  const away = normalizeCompetitor(awayRaw, status);
  const home = normalizeCompetitor(homeRaw, status);
  const boxscore = raw?.boxscore || {};
  const players = [];
  const playerDirectory = [];

  for (const group of boxscore.players || []) {
    const stats = group.statistics?.[0] || {};
    const labels = Array.isArray(stats.labels) ? stats.labels : [];
    const athletes = (stats.athletes || []).map((athlete) => {
      const person = athlete.athlete || {};
      const player = {
        id: String(person.id || ''),
        name: person.displayName || person.fullName || 'Unknown player',
        shortName: person.shortName || person.displayName || 'Unknown',
        jersey: person.jersey || '',
        position: person.position?.abbreviation || '',
        positionName: person.position?.displayName || '',
        headshot:
          person.headshot?.href ||
          (person.id
            ? `https://a.espncdn.com/i/headshots/nba/players/full/${person.id}.png`
            : ''),
        starter: Boolean(athlete.starter),
        didNotPlay: Boolean(athlete.didNotPlay),
        reason: athlete.reason || '',
        stats: athlete.didNotPlay ? null : normalizePlayerStatLine(labels, athlete.stats),
      };
      playerDirectory.push(player);
      return player;
    });

    players.push({
      teamId: String(group.team?.id || ''),
      teamAbbreviation: group.team?.abbreviation || '',
      teamName: group.team?.displayName || group.team?.name || '',
      teamLogo: pickLogo(group.team || {}),
      athletes,
    });
  }

  const teamStats = {};
  for (const teamBlock of boxscore.teams || []) {
    const teamId = String(teamBlock.team?.id || '');
    teamStats[teamId] = {
      teamId,
      homeAway: teamBlock.homeAway || '',
      ...normalizeTeamStats(teamBlock.statistics || []),
    };
  }

  const plays = (raw?.plays || []).map((play) => ({
    id: String(play.id || ''),
    sequence: Number(play.sequenceNumber) || 0,
    period: Number(play.period?.number) || 0,
    periodLabel: play.period?.displayValue || '',
    clock: play.clock?.displayValue || '',
    text: play.text || play.shortDescription || '',
    shortDescription: play.shortDescription || '',
    scoringPlay: Boolean(play.scoringPlay),
    scoreValue: Number(play.scoreValue) || 0,
    awayScore: nullableNumber(play.awayScore),
    homeScore: nullableNumber(play.homeScore),
    teamId: String(play.team?.id || ''),
    participantIds: (play.participants || []).map((participant) => String(participant.athlete?.id || '')).filter(Boolean),
    type: play.type?.text || '',
    shootingPlay: Boolean(play.shootingPlay),
    coordinate: play.coordinate || null,
  }));

  const playById = new Map(playerDirectory.map((player) => [player.id, player]));
  for (const play of plays) {
    play.participantNames = play.participantIds
      .map((id) => playById.get(id)?.name)
      .filter(Boolean);
  }

  return {
    id: String(competition.id || header.id || ''),
    date: competition.date || '',
    seasonYear,
    seasonLabel: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    status,
    venue: {
      name: raw?.gameInfo?.venue?.fullName || competition.venue?.fullName || '',
      city: raw?.gameInfo?.venue?.address?.city || competition.venue?.address?.city || '',
      state: raw?.gameInfo?.venue?.address?.state || competition.venue?.address?.state || '',
    },
    attendance: nullableNumber(competition.attendance),
    officials: (raw?.gameInfo?.officials || []).map((official) => official.displayName || official.fullName).filter(Boolean),
    broadcast: normalizeBroadcast(competition, raw?.broadcasts),
    odds: normalizeOdds(raw?.odds),
    away,
    home,
    players,
    teamStats,
    plays,
  };
}

function parseSeasonAverages(categoryEntry) {
  if (!categoryEntry) return null;
  const labels = categoryEntry.labels || [];
  const values = categoryEntry.stats || [];
  const byLabel = {};
  labels.forEach((label, index) => {
    byLabel[label] = values[index];
  });
  const [fgm, fga] = splitMadeAttempted(byLabel.FG);
  const [tpm, tpa] = splitMadeAttempted(byLabel['3PT']);
  const [ftm, fta] = splitMadeAttempted(byLabel.FT);

  return {
    gp: asNumber(byLabel.GP),
    gs: asNumber(byLabel.GS),
    min: asNumber(byLabel.MIN),
    fgm,
    fga,
    fgPct: nullableNumber(byLabel['FG%']),
    tpm,
    tpa,
    tpPct: nullableNumber(byLabel['3P%']),
    ftm,
    fta,
    ftPct: nullableNumber(byLabel['FT%']),
    oreb: asNumber(byLabel.OR),
    dreb: asNumber(byLabel.DR),
    reb: asNumber(byLabel.REB),
    ast: asNumber(byLabel.AST),
    blk: asNumber(byLabel.BLK),
    stl: asNumber(byLabel.STL),
    pf: asNumber(byLabel.PF),
    tov: asNumber(byLabel.TO),
    pts: asNumber(byLabel.PTS),
  };
}

function parseSeasonMisc(categoryEntry) {
  if (!categoryEntry) return null;
  const labels = categoryEntry.labels || [];
  const values = categoryEntry.stats || [];
  const byLabel = {};
  labels.forEach((label, index) => {
    byLabel[label] = values[index];
  });
  return {
    doubleDoubles: asNumber(byLabel.DD2),
    tripleDoubles: asNumber(byLabel.TD3),
    disqualifications: asNumber(byLabel.DQ),
    ejections: asNumber(byLabel.EJECT),
    technicals: asNumber(byLabel.TECH),
    flagrants: asNumber(byLabel.FLAG),
    astTo: nullableNumber(byLabel['AST/TO']),
    stlTo: nullableNumber(byLabel['STL/TO']),
    scoringEfficiency: nullableNumber(byLabel['SC-EFF']),
    shootingEfficiency: nullableNumber(byLabel['SH-EFF']),
  };
}

function normalizePlayer(profileRaw, statsRaw, requestedSeasonYear) {
  const athlete = profileRaw?.athlete || {};
  const seasonYear = Number(requestedSeasonYear) || new Date().getUTCFullYear();
  const statsCategories = statsRaw?.categories || [];
  const averagesCategory = statsCategories.find((category) => category.name === 'averages');
  const totalsCategory = statsCategories.find((category) => category.name === 'totals');
  const miscCategory = statsCategories.find((category) => category.name === 'miscellaneous');
  const seasonEntries = averagesCategory?.statistics || [];
  const requestedEntry =
    [...seasonEntries].reverse().find((entry) => Number(entry.season?.year) === seasonYear) ||
    seasonEntries[seasonEntries.length - 1] ||
    null;

  let season = null;
  if (requestedEntry) {
    const entryYear = Number(requestedEntry.season?.year) || seasonYear;
    const teamStats = statsRaw?.teams?.[requestedEntry.teamSlug] || null;
    const totalsEntry = totalsCategory?.statistics?.find(
      (entry) =>
        Number(entry.season?.year) === entryYear &&
        (!requestedEntry.teamId || String(entry.teamId) === String(requestedEntry.teamId)),
    );
    const miscEntry = miscCategory?.statistics?.find(
      (entry) =>
        Number(entry.season?.year) === entryYear &&
        (!requestedEntry.teamId || String(entry.teamId) === String(requestedEntry.teamId)),
    );

    season = {
      year: entryYear,
      label: requestedEntry.season?.displayName || `${entryYear - 1}-${String(entryYear).slice(-2)}`,
      teamAbbreviation: teamStats?.abbreviation || '',
      teamName: teamStats?.displayName || '',
      averages: parseSeasonAverages({
        labels: averagesCategory.labels,
        stats: requestedEntry.stats,
      }),
      totals: totalsEntry
        ? parseSeasonAverages({
            labels: totalsCategory.labels,
            stats: totalsEntry.stats,
          })
        : null,
      misc: miscEntry
        ? parseSeasonMisc({
            labels: miscCategory.labels,
            stats: miscEntry.stats,
          })
        : null,
    };
  }

  return {
    id: String(athlete.id || ''),
    name: athlete.displayName || athlete.fullName || 'NBA Player',
    firstName: athlete.firstName || '',
    lastName: athlete.lastName || '',
    shortName: athlete.shortName || athlete.displayName || '',
    jersey: athlete.jersey || athlete.displayJersey || '',
    position: athlete.position?.abbreviation || '',
    positionName: athlete.position?.displayName || '',
    headshot:
      athlete.headshot?.href ||
      (athlete.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png` : ''),
    age: nullableNumber(athlete.age),
    height: athlete.displayHeight || '',
    weight: athlete.displayWeight || '',
    birthPlace: athlete.displayBirthPlace || '',
    dateOfBirth: athlete.displayDOB || '',
    experience: athlete.displayExperience || '',
    draft: athlete.displayDraft || '',
    active: athlete.active !== false,
    team: normalizeTeam(athlete.team || {}),
    summary:
      typeof athlete.statsSummary === 'string'
        ? athlete.statsSummary
        : athlete.statsSummary?.displayName || '',
    seasonYear,
    season,
  };
}

function normalizeGamelog(raw, requestedSeasonYear) {
  const labels = raw?.labels || [];
  const events = raw?.events || {};
  const seasonYear = Number(requestedSeasonYear) || new Date().getUTCFullYear();
  const grouped = [];

  for (const seasonType of raw?.seasonTypes || []) {
    for (const category of seasonType.categories || []) {
      for (const event of category.events || []) {
        grouped.push({ ...event, sourceGroup: seasonType.displayName || '' });
      }
    }
  }

  const uniqueEvents = new Map();
  for (const entry of grouped) {
    if (entry?.eventId && !uniqueEvents.has(entry.eventId)) {
      uniqueEvents.set(entry.eventId, entry);
    }
  }

  const games = [];
  for (const [eventId, entry] of uniqueEvents) {
    const meta = events[eventId];
    if (!meta) continue;
    const byLabel = {};
    labels.forEach((label, index) => {
      byLabel[label] = entry.stats?.[index];
    });
    const [fgm, fga] = splitMadeAttempted(byLabel.FG);
    const [tpm, tpa] = splitMadeAttempted(byLabel['3PT']);
    const [ftm, fta] = splitMadeAttempted(byLabel.FT);
    games.push({
      id: String(eventId),
      date: meta.gameDate || '',
      opponentAbbreviation: meta.opponent?.abbreviation || '',
      opponentName: meta.opponent?.displayName || '',
      opponentLogo: pickLogo(meta.opponent || {}),
      atVs: meta.atVs || '',
      result: meta.gameResult || '',
      score: meta.score || '',
      teamScore: nullableNumber(meta.homeTeamScore ?? meta.teamScore),
      opponentScore: nullableNumber(meta.awayTeamScore ?? meta.opponentScore),
      stats: {
        min: minutesToNumber(byLabel.MIN),
        pts: asNumber(byLabel.PTS),
        fgm,
        fga,
        fgPct: nullableNumber(byLabel['FG%']),
        tpm,
        tpa,
        tpPct: nullableNumber(byLabel['3P%']),
        ftm,
        fta,
        ftPct: nullableNumber(byLabel['FT%']),
        reb: asNumber(byLabel.REB),
        ast: asNumber(byLabel.AST),
        blk: asNumber(byLabel.BLK),
        stl: asNumber(byLabel.STL),
        pf: asNumber(byLabel.PF),
        tov: asNumber(byLabel.TO),
      },
    });
  }

  games.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    seasonYear,
    seasonLabel: `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
    games: games.slice(0, 12),
  };
}

async function getScoreboard(date) {
  const safeDate = typeof date === 'string' && /^\d{8}$/.test(date) ? date : '';
  const url = safeDate ? `${SCOREBOARD_URL}?dates=${safeDate}` : SCOREBOARD_URL;
  const key = `scoreboard:${safeDate || 'current'}`;
  return cachedFetch(key, 12_000, 20 * 60_000, async () => {
    const raw = await fetchJson(url);
    return normalizeScoreboard(raw);
  });
}

async function getGame(gameId) {
  if (!/^\d{1,24}$/.test(String(gameId))) {
    throw new ServiceError('That game ID is not valid.', 'INVALID_INPUT', 400);
  }
  const key = `game:${gameId}`;
  return cachedFetch(key, 10_000, 20 * 60_000, async () => {
    const raw = await fetchJson(`${SUMMARY_URL}?event=${encodeURIComponent(gameId)}`);
    return normalizeSummary(raw);
  });
}

async function getPlayer(playerId, seasonYear) {
  if (!/^\d{1,24}$/.test(String(playerId))) {
    throw new ServiceError('That player ID is not valid.', 'INVALID_INPUT', 400);
  }
  const requestedSeasonYear = Math.min(
    2100,
    Math.max(2000, Number.parseInt(seasonYear, 10) || new Date().getUTCFullYear()),
  );
  const key = `player:${playerId}:${requestedSeasonYear}`;
  return cachedFetch(key, 6 * 60 * 60_000, 24 * 60 * 60_000, async () => {
    const profileUrl = `${ATHLETE_URL}/${playerId}?region=us&lang=en&contentorigin=espn`;
    const statsUrl = `${ATHLETE_URL}/${playerId}/stats?region=us&lang=en&contentorigin=espn&season=${requestedSeasonYear}`;
    const [profileRaw, statsRaw] = await Promise.all([fetchJson(profileUrl), fetchJson(statsUrl)]);
    return normalizePlayer(profileRaw, statsRaw, requestedSeasonYear);
  });
}

async function getPlayerGames(playerId, seasonYear) {
  if (!/^\d{1,24}$/.test(String(playerId))) {
    throw new ServiceError('That player ID is not valid.', 'INVALID_INPUT', 400);
  }
  const requestedSeasonYear = Math.min(
    2100,
    Math.max(2000, Number.parseInt(seasonYear, 10) || new Date().getUTCFullYear()),
  );
  const key = `games:${playerId}:${requestedSeasonYear}`;
  return cachedFetch(key, 60 * 60_000, 12 * 60 * 60_000, async () => {
    const raw = await fetchJson(
      `${ATHLETE_URL}/${playerId}/gamelog?season=${requestedSeasonYear}&region=us&lang=en&contentorigin=espn`,
    );
    return normalizeGamelog(raw, requestedSeasonYear);
  });
}

module.exports = {
  ServiceError,
  getScoreboard,
  getGame,
  getPlayer,
  getPlayerGames,
  // Exported for local verification.
  _internal: {
    normalizeScoreboard,
    normalizeSummary,
    normalizePlayer,
    normalizeGamelog,
    splitMadeAttempted,
    minutesToNumber,
  },
};
