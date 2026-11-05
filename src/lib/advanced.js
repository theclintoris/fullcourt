/**
 * FullCourt advanced-stat engine.
 *
 * All percentage metrics are returned on a 0-100 scale. The inputs are the
 * normalized ESPN DTOs from electron/nba-service.cjs. These are derived
 * metrics, not an official NBA feed — the formulas are noted in the UI.
 */

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullable = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value, digits = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percentage = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return round((numerator / denominator) * 100, 1);
};

const EMPTY_STATS = {
  min: 0,
  pts: 0,
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  oreb: 0,
  dreb: 0,
  pf: 0,
  plusMinus: 0,
};

export function emptyStatLine() {
  return { ...EMPTY_STATS };
}

export function sumPlayerStats(players = []) {
  const totals = emptyStatLine();
  for (const player of players) {
    if (!player?.stats || player.didNotPlay) continue;
    for (const key of Object.keys(EMPTY_STATS)) {
      if (key === 'plusMinus') continue;
      totals[key] += num(player.stats[key]);
    }
  }
  return totals;
}

function mergeTeamValues(base, raw = {}) {
  const values = { ...base };
  for (const [key, value] of Object.entries(raw || {})) {
    const parsed = nullable(value);
    if (parsed !== null) values[key] = parsed;
  }
  return values;
}

function createTeamContext(game, side) {
  const group = (game?.players || []).find(
    (entry) => String(entry.teamId) === String(side?.id),
  );
  const players = group?.athletes || [];
  const playerTotals = sumPlayerStats(players);
  const teamStats = game?.teamStats?.[side?.id]?.values || {};
  const values = mergeTeamValues(playerTotals, teamStats);
  const score = nullable(side?.score) ?? playerTotals.pts;

  return {
    team: side,
    players,
    values: { ...values, pts: score },
    totalMinutes: playerTotals.min,
    score,
    group,
  };
}

function opponentContextFor(contexts, teamId) {
  return Object.values(contexts).find(
    (entry) => String(entry.team?.id) !== String(teamId),
  ) || null;
}

function buildGameTotals(contexts) {
  const list = Object.values(contexts);
  const totals = emptyStatLine();
  for (const context of list) {
    for (const key of Object.keys(EMPTY_STATS)) {
      if (key === 'plusMinus') continue;
      totals[key] += num(context.values[key]);
    }
  }
  totals.pts = list.reduce((sum, context) => sum + num(context.score), 0);
  totals.totalMinutes = list.reduce((sum, context) => sum + num(context.totalMinutes), 0);
  return totals;
}

function pieValue(points, values) {
  return (
    num(points) +
    num(values.fgm) +
    num(values.ftm) -
    num(values.fga) -
    num(values.fta) +
    num(values.dreb) +
    num(values.oreb) / 2 +
    num(values.ast) +
    num(values.stl) +
    num(values.blk) / 2 -
    num(values.pf) -
    num(values.tov)
  );
}

/**
 * Build one analytics object per team, with a lookup for every box-score
 * player. Everything is derived from the current game's box score.
 */
export function buildGameAnalytics(game) {
  const contexts = {};
  const playerIndex = new Map();
  const sides = [game?.away, game?.home].filter(Boolean);

  for (const side of sides) {
    if (!side?.id) continue;
    contexts[side.id] = createTeamContext(game, side);
  }

  for (const context of Object.values(contexts)) {
    context.opponent = opponentContextFor(contexts, context.team?.id);
  }

  const gameTotals = buildGameTotals(contexts);
  const pieDenominator = pieValue(gameTotals.pts, gameTotals);
  const teamAdvanced = {};

  for (const context of Object.values(contexts)) {
    teamAdvanced[context.team.id] = computeTeamAdvanced(
      context,
      context.opponent,
      gameTotals,
      pieDenominator,
    );
    for (const player of context.players) {
      if (!player?.id) continue;
      if (!playerIndex.has(player.id)) {
        playerIndex.set(player.id, {
          player,
          team: context.team,
          teamId: context.team.id,
          teamContext: context,
          opponent: context.opponent?.team || null,
        });
      }
    }
  }

  // Team PIE uses a side's share of the combined play-impact denominator.
  for (const context of Object.values(contexts)) {
    const teamPie = pieDenominator > 0
      ? (pieValue(context.score, context.values) / pieDenominator) * 100
      : null;
    teamAdvanced[context.team.id].pie = round(teamPie, 1);
  }

  return { contexts, playerIndex, gameTotals, teamAdvanced, pieDenominator };
}

export function computeTeamAdvanced(context, opponent, gameTotals, pieDenominator) {
  if (!context) return null;
  const values = context.values || {};
  const opp = opponent?.values || {};
  const fga = num(values.fga);
  const fta = num(values.fta);
  const fgm = num(values.fgm);
  const tpm = num(values.tpm);
  const tov = num(values.tov);
  const pts = num(context.score ?? values.pts);
  const possessions = fga + 0.44 * fta + tov;
  const ts = percentage(pts, 2 * (fga + 0.44 * fta));
  const efg = percentage(fgm + 0.5 * tpm, fga);
  const tovPct = percentage(tov, possessions);
  const orebPct = percentage(values.oreb, num(values.oreb) + num(opp.dreb));
  const ftRate = percentage(fta, fga);
  const astRate = percentage(values.ast, fgm);
  const pointsPerPossession = possessions > 0 ? round(pts / possessions, 3) : null;
  const pie = pieDenominator
    ? round((pieValue(pts, values) / pieDenominator) * 100, 1)
    : null;

  return {
    ts,
    efg,
    tovPct,
    orebPct,
    ftRate,
    astRate,
    pointsPerPossession,
    possessions: round(possessions, 1),
    pie,
    scoringMargin: round(pts - num(opponent?.score), 0),
  };
}

export function playerGameAdvanced(stats, context, gameTotals) {
  if (!stats) return null;
  const min = num(stats.min);
  const teamValues = context?.values || {};
  const teamMinutes = num(context?.totalMinutes);
  const oppValues = context?.opponent?.values || {};
  const teamFga = num(teamValues.fga);
  const teamFta = num(teamValues.fta);
  const teamTov = num(teamValues.tov);
  const fga = num(stats.fga);
  const fta = num(stats.fta);
  const tpm = num(stats.tpm);
  const fgm = num(stats.fgm);
  const pts = num(stats.pts);

  const ts = percentage(pts, 2 * (fga + 0.44 * fta));
  const efg = percentage(fgm + 0.5 * tpm, fga);
  const teamPossessions = teamFga + 0.44 * teamFta + teamTov;
  const playerPossessions = fga + 0.44 * fta + num(stats.tov);
  const usage =
    min > 0 && teamMinutes > 0 && teamPossessions > 0
      ? round(
          ((playerPossessions * (teamMinutes / 5)) / (min * teamPossessions)) * 100,
          1,
        )
      : null;

  const teamFgm = num(teamValues.fgm);
  const assistedFieldGoalDenominator = min > 0 && teamMinutes > 0
    ? (min / (teamMinutes / 5)) * teamFgm - fgm
    : 0;
  const astPct = assistedFieldGoalDenominator > 0
    ? percentage(stats.ast, assistedFieldGoalDenominator)
    : null;

  const reboundChances = num(teamValues.reb) + num(oppValues.reb);
  const rebPct =
    min > 0 && teamMinutes > 0 && reboundChances > 0
      ? percentage(
          num(stats.reb) * (teamMinutes / 5),
          min * reboundChances,
        )
      : null;

  const gameScore =
    pts +
    0.4 * fgm -
    0.7 * fga -
    0.4 * (fta - num(stats.ftm)) +
    0.7 * num(stats.oreb) +
    0.3 * num(stats.dreb) +
    num(stats.stl) +
    0.7 * num(stats.ast) +
    0.7 * num(stats.blk) -
    0.4 * num(stats.pf) -
    num(stats.tov);

  const totalPie = gameTotals ? pieValue(gameTotals.pts, gameTotals) : 0;
  const playerPie = pieValue(pts, stats);
  const pie = totalPie > 0 ? round((playerPie / totalPie) * 100, 1) : null;

  return {
    ts,
    efg,
    usg: usage,
    astPct,
    rebPct,
    pie,
    gameScore: round(gameScore, 1),
    pointsPerShot: fga > 0 ? round(pts / fga, 2) : null,
    trueShootingAttempts: round(fga + 0.44 * fta, 1),
  };
}

/**
 * Season advanced metrics from ESPN season averages + miscellaneous totals.
 * Team-relative metrics (USG%, AST%, REB%) require team context we do not get
 * from the profile endpoint, so those are intentionally omitted here.
 */
export function seasonAdvanced(averages, misc = null) {
  if (!averages) return null;
  const fga = num(averages.fga);
  const fta = num(averages.fta);
  const fgm = num(averages.fgm);
  const tpm = num(averages.tpm);
  const pts = num(averages.pts);
  const min = num(averages.min);
  const ast = num(averages.ast);
  const tov = num(averages.tov);
  const stl = num(averages.stl);
  const reb = num(averages.reb);

  const per36 = min > 0
    ? {
        pts: round((pts / min) * 36, 1),
        reb: round((reb / min) * 36, 1),
        ast: round((ast / min) * 36, 1),
        stl: round((stl / min) * 36, 1),
        blk: round((num(averages.blk) / min) * 36, 1),
      }
    : null;

  return {
    ts: percentage(pts, 2 * (fga + 0.44 * fta)),
    efg: percentage(fgm + 0.5 * tpm, fga),
    ftRate: percentage(fta, fga),
    threePtRate: percentage(num(averages.tpa), fga),
    astTo: misc?.astTo ?? (tov > 0 ? round(ast / tov, 2) : null),
    stlTo: misc?.stlTo ?? (tov > 0 ? round(stl / tov, 2) : null),
    pointsPerShot: fga > 0 ? round(pts / fga, 2) : null,
    per36,
    scoringEfficiency: misc?.scoringEfficiency ?? null,
    shootingEfficiency: misc?.shootingEfficiency ?? null,
  };
}

/** Aggregate a set of normalized game-log stat lines. */
export function aggregateGameStats(games = []) {
  const totals = emptyStatLine();
  for (const game of games) {
    const stats = game?.stats;
    if (!stats) continue;
    for (const key of Object.keys(EMPTY_STATS)) {
      if (key === 'plusMinus' || key === 'min') continue;
      totals[key] += num(stats[key]);
    }
    totals.min += num(stats.min);
  }
  return {
    ...totals,
    ts: percentage(totals.pts, 2 * (totals.fga + 0.44 * totals.fta)),
    efg: percentage(totals.fgm + 0.5 * totals.tpm, totals.fga),
    games: games.length,
  };
}

export function sortBoxPlayers(players = []) {
  return [...players].sort((a, b) => {
    if (a.didNotPlay !== b.didNotPlay) return a.didNotPlay ? 1 : -1;
    if (a.starter !== b.starter) return a.starter ? -1 : 1;
    return num(b.stats?.min) - num(a.stats?.min);
  });
}

export { num as asNumber, nullable as asNullableNumber, round };
