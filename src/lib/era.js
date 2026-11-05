const REFERENCE_ORTG = 115;
const REFERENCE_TS_PCT = 57.5;

export const ERA_REFERENCE = {
  ortg: REFERENCE_ORTG,
  tsPct: REFERENCE_TS_PCT,
  label: 'Modern reference: 115.0 ORtg, 57.5 TS%',
};

export const LEGEND_PRESETS = [
  { name: 'Michael Jordan', season: 1996, label: 'MJ · 1995-96' },
  { name: 'LeBron James', season: 2013, label: 'LeBron · 2012-13' },
  { name: 'Stephen Curry', season: 2016, label: 'Curry · 2015-16' },
  { name: 'Wilt Chamberlain', season: 1962, label: 'Wilt · 1961-62' },
  { name: 'Kareem Abdul-Jabbar', season: 1972, label: 'Kareem · 1971-72' },
  { name: 'Nikola Jokić', season: 2024, label: 'Jokić · 2023-24' },
];

function number(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function seasonLabelForYear(seasonYear) {
  if (!seasonYear) return '';
  return `${seasonYear - 1}-${String(seasonYear).slice(-2)}`;
}

export function estimatePer100(statPerGame, minutesPerGame, leaguePace) {
  const stat = number(statPerGame);
  const minutes = number(minutesPerGame);
  const pace = number(leaguePace);
  if (stat === null || !minutes || !pace) return null;
  const playerPossessions = pace * (minutes / 48);
  if (playerPossessions <= 0) return null;
  return (stat / playerPossessions) * 100;
}

export function tsPlus(tsPct, leagueTsPct) {
  const ts = number(tsPct);
  const league = number(leagueTsPct);
  if (ts === null || !league) return null;
  return (ts / league) * 100;
}

export function eraAdjustedPtsPer100(ptsPer100, leagueOrtg) {
  const pts = number(ptsPer100);
  const ortg = number(leagueOrtg);
  if (pts === null || !ortg) return null;
  return pts * (REFERENCE_ORTG / ortg);
}

export function playerEraProfile(player, era) {
  if (!player) return null;
  const per100 = player.per100 || {};
  const stats = player.stats || {};
  const advanced = player.advanced || {};
  const mpg = number(player.mpg);
  const pace = number(era?.pace);

  const estimated = {
    pts: per100.pts ?? estimatePer100(stats.pts, mpg, pace),
    reb: per100.reb ?? estimatePer100(stats.reb, mpg, pace),
    ast: per100.ast ?? estimatePer100(stats.ast, mpg, pace),
    stl: per100.stl ?? estimatePer100(stats.stl, mpg, pace),
    blk: per100.blk ?? estimatePer100(stats.blk, mpg, pace),
    tpm: per100.tpm ?? estimatePer100(stats.tpm, mpg, pace),
    tov: per100.tov ?? estimatePer100(stats.tov, mpg, pace),
  };
  const usingEstimate = Boolean(player.per100Estimated) || ![per100.pts, per100.reb, per100.ast].some((value) => number(value) !== null);

  const ts = stats.tsPct ?? advanced.tsPct;
  const tsp = tsPlus(ts, era?.tsPct);
  const adjustedPts = eraAdjustedPtsPer100(estimated.pts, era?.ortg);
  const adjustedReb = era?.pace ? estimated.reb : null;
  const adjustedAst = era?.pace ? estimated.ast : null;
  const threeParPlus = advanced.threePtAr != null && era?.threePtAr
    ? (advanced.threePtAr / era.threePtAr) * 100
    : null;
  const ftrPlus = advanced.ftr != null && era?.ftr ? (advanced.ftr / era.ftr) * 100 : null;
  const scoringIndex = adjustedPts != null ? adjustedPts * (tsp ? tsp / 100 : 1) : null;

  return {
    per100: {
      ...estimated,
      tsPct: ts ?? null,
      usgPct: advanced.usgPct ?? null,
    },
    adjusted: {
      ptsPer100: adjustedPts,
      scoringIndex,
      tsPlus: tsp,
      threeParPlus,
      ftrPlus,
      rebPer100: adjustedReb,
      astPer100: adjustedAst,
    },
    usingEstimate,
    era: {
      pace: era?.pace ?? null,
      ortg: era?.ortg ?? null,
      tsPct: era?.tsPct ?? null,
      threePtAr: era?.threePtAr ?? null,
      ftr: era?.ftr ?? null,
    },
  };
}

export function eraProfileRows(players) {
  return players.map((player) => ({ player, profile: playerEraProfile(player, player.era) }));
}

export function adjustedLeader(players, metric, direction = 'desc') {
  const withValues = players
    .map((player) => ({ player, value: playerEraProfile(player, player.era)?.adjusted?.[metric] }))
    .filter((entry) => number(entry.value) !== null);
  if (!withValues.length) return null;
  withValues.sort((a, b) => (direction === 'desc' ? b.value - a.value : a.value - b.value));
  return withValues[0];
}

export const ERA_METHOD = [
  'Per-100 rates are pace-neutral and come directly from Basketball Reference per-possession tables when available.',
  'For seasons before per-possession data, per-100 rates are estimated from per-game production, league pace and minutes per game.',
  'Era-adjusted scoring scales per-100 scoring to a 115.0 league offensive-rating baseline; TS+ indexes true shooting against the league season average.',
  'TS+, 3PAr+ and FTr+ are rate indices (100 = league average), not point totals. Adjusted figures are experimental and meant for context, not as a claim of player superiority.',
];
