export const PER_GAME_STATS = [
  { key: 'points', abbreviation: 'PTS', label: 'Points per game' },
  { key: 'rebounds', abbreviation: 'REB', label: 'Rebounds per game' },
  { key: 'assists', abbreviation: 'AST', label: 'Assists per game' },
  { key: 'steals', abbreviation: 'STL', label: 'Steals per game' },
  { key: 'blocks', abbreviation: 'BLK', label: 'Blocks per game' },
  { key: 'threes', abbreviation: '3PM', label: 'Threes per game' },
];

const NUMBER_FORMAT = new Intl.NumberFormat('en-NZ');

export function winRate(wins, losses) {
  return wins + losses ? wins / (wins + losses) : null;
}

export function formatWinRate(rate) {
  return rate === null ? '—' : rate.toFixed(3).replace(/^0/, '');
}

export function formatRecord(wins, losses) {
  return `${NUMBER_FORMAT.format(wins)}–${NUMBER_FORMAT.format(losses)}`;
}

export function franchiseSummary(seasons) {
  const totals = {
    wins: 0, losses: 0, playoffWins: 0, playoffLosses: 0, playoffTrips: 0,
    championships: [], abaChampionships: [],
  };
  for (const season of seasons) {
    totals.wins += season.wins;
    totals.losses += season.losses;
    totals.playoffWins += season.playoffWins;
    totals.playoffLosses += season.playoffLosses;
    if (season.playoffs) totals.playoffTrips += 1;
    if (season.playoffs === 'Champions') {
      const titles = season.league === 'ABA' ? totals.abaChampionships : totals.championships;
      titles.push(season);
    }
  }
  return totals;
}

export function findSeasonRecord(seasons, valueFor) {
  let value = -Infinity;
  let holders = [];
  for (const season of seasons) {
    const score = valueFor(season);
    if (!Number.isFinite(score) || score < value) continue;
    if (score > value) {
      value = score;
      holders = [];
    }
    holders.push(season);
  }
  return holders.length ? { value, holders } : null;
}
