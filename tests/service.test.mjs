import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  splitMadeAttempted,
  minutesToNumber,
  normalizeScoreboard,
  normalizeSummary,
  normalizePlayer,
  normalizeGamelog,
} = require('../electron/nba-service.cjs')._internal;

const awayTeam = {
  id: '1',
  abbreviation: 'AWY',
  displayName: 'Away Team',
  shortDisplayName: 'Away',
  name: 'Away',
  location: 'Away City',
  color: '#112233',
  alternateColor: '#445566',
  logos: [{ href: 'https://example.com/away.png' }],
};
const homeTeam = {
  id: '2',
  abbreviation: 'HOM',
  displayName: 'Home Team',
  shortDisplayName: 'Home',
  name: 'Home',
  location: 'Home City',
  color: '#771122',
  logos: [{ href: 'https://example.com/home.png' }],
};
const status = {
  displayClock: '5:00',
  period: 3,
  type: {
    state: 'in',
    detail: '3rd Quarter',
    shortDetail: '3rd',
    completed: false,
  },
};

function competitor(team, homeAway, score) {
  return {
    id: team.id,
    homeAway,
    score,
    team,
    records: [{ name: 'overall', summary: homeAway === 'away' ? '10-5' : '8-7' }],
    linescores: [{ period: 1, value: 28 }],
  };
}

test('splitMadeAttempted and minutesToNumber parse ESPN stat strings', () => {
  assert.deepEqual(splitMadeAttempted('5-8'), [5, 8]);
  assert.deepEqual(splitMadeAttempted('6.2-13.7'), [6.2, 13.7]);
  assert.deepEqual(splitMadeAttempted('0-0'), [0, 0]);
  assert.deepEqual(splitMadeAttempted('--'), [null, null]);
  assert.equal(minutesToNumber('35:12'), 35.2);
  assert.equal(minutesToNumber('35.2'), 35.2);
  assert.equal(minutesToNumber('--'), null);
});

test('normalizeScoreboard builds the slate DTO', () => {
  const board = normalizeScoreboard({
    day: { date: '2026-11-04' },
    leagues: [{ season: { year: 2027, type: { name: 'Regular Season' } } }],
    events: [{
      id: '401',
      date: '2026-11-04T23:00:00Z',
      name: 'Away Team at Home Team',
      shortName: 'AWY @ HOM',
      status,
      competitions: [{
        status,
        competitors: [competitor(awayTeam, 'away', '100'), competitor(homeTeam, 'home', '98')],
        venue: { fullName: 'Test Arena' },
        broadcasts: [{ names: ['ESPN'] }],
        odds: [{ details: 'AWY -3.5', overUnder: 222.5, provider: { name: 'ESPN BET' } }],
      }],
    }],
  });

  assert.equal(board.date, '2026-11-04');
  assert.equal(board.seasonYear, 2027);
  assert.equal(board.seasonLabel, '2026-27');
  assert.equal(board.seasonType, 'Regular Season');
  assert.equal(board.games.length, 1);
  const game = board.games[0];
  assert.equal(game.id, '401');
  assert.equal(game.status.state, 'in');
  assert.equal(game.status.clock, '5:00');
  assert.equal(game.status.period, 3);
  assert.equal(game.venue, 'Test Arena');
  assert.equal(game.broadcast, 'ESPN');
  assert.equal(game.odds.details, 'AWY -3.5');
  assert.equal(game.away.score, 100);
  assert.equal(game.home.score, 98);
  assert.equal(game.away.record, '10-5');
  assert.equal(game.away.logo, 'https://example.com/away.png');
  assert.equal(game.away.linescores[0].value, 28);
});

test('normalizeScoreboard keeps pregame scores null', () => {
  const pregameStatus = { type: { state: 'pre', detail: '7:30 PM' } };
  const board = normalizeScoreboard({
    day: { date: '2026-11-05' },
    leagues: [{ season: { year: 2027 } }],
    events: [{
      id: '402',
      status: pregameStatus,
      competitions: [{
        status: pregameStatus,
        competitors: [competitor(awayTeam, 'away', '0'), competitor(homeTeam, 'home', '0')],
      }],
    }],
  });
  assert.equal(board.games[0].away.score, null);
  assert.equal(board.games[0].home.score, null);
  assert.equal(board.games[0].status.state, 'pre');
});

test('normalizeSummary parses boxscore, team stats, plays and game info', () => {
  const summary = normalizeSummary({
    header: {
      id: '401',
      season: { year: 2027 },
      competitions: [{
        id: '401',
        date: '2026-11-04T23:00:00Z',
        status,
        competitors: [competitor(awayTeam, 'away', '100'), competitor(homeTeam, 'home', '98')],
        broadcasts: [{ names: ['ESPN'] }],
        attendance: 18000,
        venue: { fullName: 'Test Arena' },
      }],
    },
    boxscore: {
      players: [{
        team: awayTeam,
        statistics: [{
          labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'],
          athletes: [
            {
              athlete: {
                id: '10',
                displayName: 'Player One',
                shortName: 'P. One',
                jersey: '3',
                position: { abbreviation: 'G' },
              },
              starter: true,
              didNotPlay: false,
              stats: ['35:12', '28', '10-20', '4-9', '4-5', '7', '6', '3', '2', '1', '1', '6', '2', '+8'],
            },
            {
              athlete: { id: '11', displayName: 'Bench Player' },
              starter: false,
              didNotPlay: true,
              reason: 'Coach decision',
              stats: [],
            },
          ],
        }],
      }],
      teams: [{
        team: awayTeam,
        statistics: [
          { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '40-88' },
          { name: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', displayValue: '12-35' },
          { name: 'totalRebounds', displayValue: '44' },
        ],
      }],
    },
    gameInfo: {
      venue: { fullName: 'Test Arena', address: { city: 'Test City', state: 'TS' } },
      officials: [{ displayName: 'Ref One' }, { displayName: 'Ref Two' }],
    },
    plays: [{
      id: 'p1',
      sequenceNumber: 10,
      period: { number: 2, displayValue: '2nd Quarter' },
      clock: { displayValue: '31.8' },
      text: 'Player One makes 20-foot jumper',
      scoreValue: 2,
      awayScore: 55,
      homeScore: 57,
      team: { id: '1' },
      participants: [{ athlete: { id: '10' } }],
      type: { text: 'Jump Shot' },
      scoringPlay: true,
    }],
    broadcasts: [{ name: 'ESPN' }],
    odds: [{ details: 'AWY -3.5', overUnder: 222.5, provider: { name: 'ESPN BET' } }],
  });

  assert.equal(summary.id, '401');
  assert.equal(summary.seasonLabel, '2026-27');
  assert.equal(summary.away.score, 100);
  assert.equal(summary.venue.name, 'Test Arena');
  assert.equal(summary.venue.city, 'Test City');
  assert.deepEqual(summary.officials, ['Ref One', 'Ref Two']);
  assert.equal(summary.attendance, 18000);
  assert.equal(summary.players[0].athletes[0].stats.min, 35.2);
  assert.equal(summary.players[0].athletes[0].stats.pts, 28);
  assert.equal(summary.players[0].athletes[0].stats.fgm, 10);
  assert.equal(summary.players[0].athletes[0].stats.plusMinus, 8);
  assert.equal(summary.players[0].athletes[1].didNotPlay, true);
  assert.equal(summary.players[0].athletes[1].stats, null);
  assert.equal(summary.players[0].athletes[1].reason, 'Coach decision');
  assert.equal(summary.teamStats['1'].values.fgm, 40);
  assert.equal(summary.teamStats['1'].values.tpm, 12);
  assert.equal(summary.teamStats['1'].values.reb, 44);
  assert.equal(summary.plays[0].participantNames[0], 'Player One');
  assert.equal(summary.plays[0].periodLabel, '2nd Quarter');
  assert.equal(summary.odds.details, 'AWY -3.5');
});

test('normalizePlayer parses bio, season averages and object statsSummary', () => {
  const profile = {
    athlete: {
      id: '10',
      displayName: 'Player One',
      firstName: 'Player',
      lastName: 'One',
      shortName: 'P. One',
      jersey: '3',
      position: { abbreviation: 'G', displayName: 'Guard' },
      age: 26,
      displayHeight: "6' 6\"",
      displayWeight: '200 lbs',
      displayBirthPlace: 'Test City, TS',
      displayDOB: 'March 1, 2000',
      displayExperience: '4 years',
      displayDraft: '2021 R1 P3',
      active: true,
      headshot: { href: 'https://example.com/player.png' },
      team: awayTeam,
      statsSummary: { displayName: '2026-27 regular season stats', statistics: [{}] },
    },
  };
  const stats = {
    categories: [
      {
        name: 'averages',
        labels: ['GP', 'GS', 'MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'OR', 'DR', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'],
        statistics: [{
          season: { year: 2027, displayName: '2026-27' },
          teamId: '1',
          teamSlug: 'awy',
          stats: ['10', '10', '34.0', '9.0-18.0', '50.0', '3.0-8.0', '37.5', '4.0-5.0', '80.0', '1.0', '4.0', '5.0', '6.0', '0.5', '1.5', '2.0', '3.0', '25.0'],
        }],
      },
      {
        name: 'totals',
        labels: ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'],
        statistics: [{
          season: { year: 2027 },
          teamId: '1',
          stats: ['340', '90-180', '30-80', '40-50', '50', '60', '5', '15', '20', '30', '250'],
        }],
      },
      {
        name: 'miscellaneous',
        labels: ['DD2', 'TD3', 'AST/TO', 'STL/TO', 'SC-EFF', 'SH-EFF'],
        statistics: [{
          season: { year: 2027 },
          teamId: '1',
          stats: ['2', '1', '2.0', '0.5', '1.17', '0.55'],
        }],
      },
    ],
    teams: { awy: { abbreviation: 'AWY', displayName: 'Away Team' } },
  };
  const player = normalizePlayer(profile, stats, 2027);

  assert.equal(player.id, '10');
  assert.equal(player.name, 'Player One');
  assert.equal(player.summary, '2026-27 regular season stats');
  assert.equal(player.season.label, '2026-27');
  assert.equal(player.season.teamAbbreviation, 'AWY');
  assert.equal(player.season.averages.min, 34);
  assert.equal(player.season.averages.fgm, 9);
  assert.equal(player.season.averages.fga, 18);
  assert.equal(player.season.averages.pts, 25);
  assert.equal(player.season.totals.pts, 250);
  assert.equal(player.season.misc.astTo, 2);
  assert.equal(player.headshot, 'https://example.com/player.png');
});

test('normalizeGamelog de-duplicates events and reads scores from metadata', () => {
  const labels = ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
  const raw = {
    labels,
    events: {
      e1: {
        gameDate: '2026-11-02T00:00:00Z',
        atVs: 'vs',
        gameResult: 'W',
        score: '110-100',
        homeTeamScore: 110,
        awayTeamScore: 100,
        opponent: homeTeam,
      },
      e2: {
        gameDate: '2026-10-30T00:00:00Z',
        atVs: '@',
        gameResult: 'L',
        score: '98-102',
        homeTeamScore: 98,
        awayTeamScore: 102,
        opponent: awayTeam,
      },
    },
    seasonTypes: [{
      categories: [{
        events: [
          { eventId: 'e1', stats: ['35:12', '10-20', '50.0', '4-9', '44.4', '4-5', '80.0', '7', '6', '1', '2', '2', '3', '28'] },
          { eventId: 'e1', stats: ['35:12', '10-20', '50.0', '4-9', '44.4', '4-5', '80.0', '7', '6', '1', '2', '2', '3', '28'] },
          { eventId: 'e2', stats: ['30:00', '8-17', '47.1', '2-7', '28.6', '4-6', '66.7', '5', '4', '0', '1', '3', '2', '22'] },
        ],
      }],
    }],
  };
  const log = normalizeGamelog(raw, 2027);

  assert.equal(log.seasonLabel, '2026-27');
  assert.equal(log.games.length, 2);
  assert.equal(log.games[0].id, 'e1');
  assert.equal(log.games[0].teamScore, 110);
  assert.equal(log.games[0].opponentScore, 100);
  assert.equal(log.games[0].result, 'W');
  assert.equal(log.games[0].stats.min, 35.2);
  assert.equal(log.games[0].stats.pts, 28);
  assert.equal(log.games[0].stats.fgm, 10);
  assert.equal(log.games[1].id, 'e2');
});
