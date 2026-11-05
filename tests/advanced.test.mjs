import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateGameStats,
  buildGameAnalytics,
  computeTeamAdvanced,
  playerGameAdvanced,
  seasonAdvanced,
  sortBoxPlayers,
  sumPlayerStats,
} from '../src/lib/advanced.js';

const closeTo = (actual, expected, tolerance = 0.11) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test('seasonAdvanced computes true shooting, eFG, rates and per-36 lines', () => {
  const averages = {
    gp: 10,
    gs: 10,
    min: 34,
    pts: 25,
    fgm: 9,
    fga: 18,
    tpm: 3,
    tpa: 8,
    ftm: 4,
    fta: 5,
    reb: 5,
    ast: 6,
    stl: 1.5,
    blk: 0.5,
    pf: 2,
    tov: 3,
    fgPct: 50,
    tpPct: 37.5,
    ftPct: 80,
  };
  const result = seasonAdvanced(averages, { astTo: 2.1, scoringEfficiency: 1.17 });

  closeTo(result.ts, 61.9);
  closeTo(result.efg, 58.3);
  closeTo(result.ftRate, 27.8);
  closeTo(result.threePtRate, 44.4);
  assert.equal(result.astTo, 2.1);
  closeTo(result.per36.pts, 26.5);
  closeTo(result.per36.reb, 5.3);
  closeTo(result.per36.ast, 6.4);
  closeTo(result.per36.stl, 1.6);
  assert.equal(result.scoringEfficiency, 1.17);
});

test('computeTeamAdvanced applies the four factors and possession estimate', () => {
  const context = {
    team: { id: '1' },
    score: 100,
    totalMinutes: 240,
    values: {
      fgm: 40,
      fga: 88,
      tpm: 12,
      tpa: 35,
      ftm: 8,
      fta: 10,
      reb: 40,
      oreb: 10,
      dreb: 30,
      ast: 25,
      tov: 13,
      pf: 20,
    },
  };
  const opponent = {
    score: 95,
    values: { reb: 38, dreb: 28, oreb: 10 },
  };
  const result = computeTeamAdvanced(context, opponent, null, null);

  closeTo(result.ts, 54.1);
  closeTo(result.efg, 52.3);
  closeTo(result.tovPct, 12.3);
  closeTo(result.orebPct, 26.3);
  closeTo(result.ftRate, 11.4);
  closeTo(result.astRate, 62.5);
  assert.equal(result.pointsPerPossession, 0.949);
  assert.equal(result.possessions, 105.4);
  assert.equal(result.scoringMargin, 5);
  assert.equal(result.pie, null);
});

test('playerGameAdvanced computes usage, efficiency and Game Score', () => {
  const stats = {
    min: 36,
    pts: 28,
    fgm: 10,
    fga: 20,
    tpm: 4,
    tpa: 9,
    ftm: 4,
    fta: 5,
    reb: 7,
    ast: 6,
    tov: 3,
    stl: 2,
    blk: 1,
    oreb: 1,
    dreb: 6,
    pf: 2,
    plusMinus: 8,
  };
  const context = {
    score: 100,
    totalMinutes: 240,
    values: {
      fgm: 40,
      fga: 88,
      tpm: 12,
      tpa: 35,
      ftm: 8,
      fta: 10,
      reb: 40,
      oreb: 10,
      dreb: 30,
      ast: 25,
      tov: 13,
      pf: 20,
    },
    opponent: { values: { reb: 38 } },
  };
  const gameTotals = {
    pts: 100,
    fgm: 40,
    fga: 88,
    tpm: 12,
    tpa: 35,
    ftm: 8,
    fta: 10,
    reb: 40,
    oreb: 10,
    dreb: 30,
    ast: 25,
    tov: 13,
    stl: 8,
    blk: 5,
    pf: 20,
  };
  const result = playerGameAdvanced(stats, context, gameTotals);

  closeTo(result.ts, 63.1);
  closeTo(result.efg, 60);
  closeTo(result.usg, 31.9);
  closeTo(result.astPct, 30);
  closeTo(result.rebPct, 12);
  assert.equal(result.gameScore, 23.2);
  assert.equal(result.pointsPerShot, 1.4);
  assert.ok(result.pie > 0 && result.pie < 100);
});

test('buildGameAnalytics indexes both rosters and distributes PIE to 100', () => {
  const makePlayer = (id, pts, extra = {}) => ({
    id,
    name: id,
    stats: {
      min: 24,
      pts,
      fgm: 10,
      fga: 20,
      tpm: 3,
      tpa: 8,
      ftm: pts - 23,
      fta: 6,
      reb: 7,
      ast: 4,
      tov: 2,
      stl: 1,
      blk: 1,
      oreb: 1,
      dreb: 6,
      pf: 2,
      plusMinus: 4,
      ...extra,
    },
  });
  const game = {
    away: { id: '1', abbreviation: 'AWY', score: 60 },
    home: { id: '2', abbreviation: 'HOM', score: 58 },
    players: [
      {
        teamId: '1',
        athletes: [makePlayer('a1', 30, { starter: true }), makePlayer('a2', 30)],
      },
      {
        teamId: '2',
        athletes: [makePlayer('h1', 30, { starter: true }), makePlayer('h2', 28)],
      },
    ],
  };

  const analytics = buildGameAnalytics(game);

  assert.deepEqual(Object.keys(analytics.contexts), ['1', '2']);
  assert.equal(analytics.playerIndex.size, 4);
  assert.equal(analytics.contexts['1'].opponent.team.id, '2');
  closeTo(analytics.teamAdvanced['1'].pie + analytics.teamAdvanced['2'].pie, 100, 0.2);
  const playerPie = [...analytics.playerIndex.values()]
    .reduce(
      (sum, entry) => sum + (
        playerGameAdvanced(entry.player.stats, entry.teamContext, analytics.gameTotals)?.pie ?? 0
      ),
      0,
    );
  closeTo(playerPie, 100, 0.3);
});

test('sortBoxPlayers puts starters first, then minutes, with DNPs last', () => {
  const players = [
    { name: 'bench-low', starter: false, didNotPlay: false, stats: { min: 8 } },
    { name: 'bench-high', starter: false, didNotPlay: false, stats: { min: 24 } },
    { name: 'starter-low', starter: true, didNotPlay: false, stats: { min: 30 } },
    { name: 'starter-high', starter: true, didNotPlay: false, stats: { min: 36 } },
    { name: 'dnp', starter: false, didNotPlay: true, stats: null },
  ];
  assert.deepEqual(
    sortBoxPlayers(players).map((player) => player.name),
    ['starter-high', 'starter-low', 'bench-high', 'bench-low', 'dnp'],
  );
});

test('sumPlayerStats and aggregateGameStats ignore DNPs and compute shooting', () => {
  const players = [
    { didNotPlay: false, stats: { min: 30, pts: 20, fgm: 7, fga: 15, tpm: 2, tpa: 6, ftm: 4, fta: 5, reb: 5, ast: 3, tov: 2, stl: 1, blk: 0, oreb: 1, dreb: 4, pf: 2, plusMinus: 6 } },
    { didNotPlay: false, stats: { min: 20, pts: 10, fgm: 4, fga: 9, tpm: 1, tpa: 3, ftm: 1, fta: 2, reb: 4, ast: 2, tov: 1, stl: 0, blk: 1, oreb: 2, dreb: 2, pf: 1, plusMinus: -3 } },
    { didNotPlay: true, reason: 'Coach decision', stats: null },
  ];
  const totals = sumPlayerStats(players);
  assert.equal(totals.pts, 30);
  assert.equal(totals.min, 50);
  assert.equal(totals.reb, 9);
  assert.equal(totals.plusMinus, 0);

  const aggregate = aggregateGameStats([
    { stats: players[0].stats },
    { stats: players[1].stats },
  ]);
  assert.equal(aggregate.games, 2);
  assert.equal(aggregate.pts, 30);
  closeTo(aggregate.ts, 55.4);
  closeTo(aggregate.efg, 52.1);
});

