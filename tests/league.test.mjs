import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  currentSeasonYear,
  seasonLabelFor,
  seasonOptions,
  seasonsBetween,
} from '../src/lib/season.js';
import {
  ERA_REFERENCE,
  LEGEND_PRESETS,
  eraAdjustedPtsPer100,
  estimatePer100,
  playerEraProfile,
  tsPlus,
} from '../src/lib/era.js';

const require = createRequire(import.meta.url);
const { buildDailyLeaders, _internal } = require('../electron/league-service.cjs');

const closeTo = (actual, expected, tolerance = 0.011) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test('season helpers follow the NBA September rollover', () => {
  assert.equal(currentSeasonYear(new Date(2026, 8, 30)), 2026);
  assert.equal(currentSeasonYear(new Date(2026, 9, 1)), 2027);
  assert.equal(seasonLabelFor(2027), '2026-27');
  assert.equal(seasonLabelFor(1996), '1995-96');
  assert.equal(seasonLabelFor(1940), 'NBA');
  assert.deepEqual(seasonOptions(2025, 2027), [2027, 2026, 2025]);
  assert.deepEqual(seasonsBetween(2025, 2027), [2027, 2026, 2025]);
});

test('era math estimates per-100 rates and adjusts to the modern baseline', () => {
  closeTo(estimatePer100(30, 36, 100), 40);
  assert.equal(estimatePer100(30, 0, 100), null);
  closeTo(tsPlus(58.2, 54.2), 107.38, 0.01);
  assert.equal(tsPlus(58.2, 0), null);
  closeTo(eraAdjustedPtsPer100(42.5, 107.6), 45.42, 0.01);
  assert.equal(eraAdjustedPtsPer100(null, 107.6), null);
  assert.equal(ERA_REFERENCE.ortg, 115);
  assert.ok(LEGEND_PRESETS.length >= 4);
});

test('playerEraProfile prefers per-100 data and computes indexes', () => {
  const player = {
    mpg: 37.0,
    stats: { pts: 30.4, reb: 6.6, ast: 4.3, stl: 2.2, blk: 0.5, tpm: 0.5, tov: 2.4, tsPct: 58.2 },
    advanced: { tsPct: 58.2, usgPct: 33.0, threePtAr: 20.0, ftr: 32.0 },
    per100: { pts: 42.5, reb: 9.3, ast: 6.0, stl: 3.1, blk: 0.7, tpm: 0.7, tov: 3.4 },
    per100Estimated: false,
  };
  const era = { pace: 91.8, ortg: 107.6, tsPct: 54.2, threePtAr: 20.0, ftr: 32.0 };
  const profile = playerEraProfile(player, era);

  closeTo(profile.per100.pts, 42.5);
  closeTo(profile.adjusted.ptsPer100, 45.42, 0.01);
  closeTo(profile.adjusted.tsPlus, 107.38, 0.01);
  closeTo(profile.adjusted.threeParPlus, 100);
  closeTo(profile.adjusted.ftrPlus, 100);
  closeTo(profile.adjusted.scoringIndex, 48.79, 0.02);
  assert.equal(profile.usingEstimate, false);
  assert.equal(profile.era.pace, 91.8);
});

test('playerEraProfile estimates per-100 rates when historical table is missing', () => {
  const player = {
    mpg: 48,
    stats: { pts: 50.4, reb: 25.7, ast: 2.4, stl: 1.8, blk: 8.6, tpm: 0, tov: 3.3 },
    advanced: { usgPct: 34.0, threePtAr: 0, ftr: 30 },
    per100: null,
    per100Estimated: true,
  };
  const era = { pace: 126.2, ortg: 93.6, tsPct: 47.9, threePtAr: 0, ftr: 34.4 };
  const profile = playerEraProfile(player, era);

  closeTo(profile.per100.pts, 39.94, 0.01);
  closeTo(profile.adjusted.ptsPer100, 49.07, 0.01);
  assert.equal(profile.usingEstimate, true);
});

test('parseStandings normalizes seeds, records and conference tables', () => {
  const raw = {
    children: [
      {
        id: '1',
        name: 'Eastern Conference',
        abbreviation: 'East',
        standings: {
          entries: [
            {
              team: {
                id: '20',
                abbreviation: 'PHI',
                displayName: 'Philadelphia 76ers',
                shortDisplayName: '76ers',
                logos: [{ href: 'https://example.com/phi.png' }],
              },
              stats: [
                { name: 'wins', value: 8, displayValue: '8' },
                { name: 'losses', value: 1, displayValue: '1' },
                { name: 'winPercent', value: 0.889, displayValue: '.889' },
                { name: 'gamesBehind', value: 0, displayValue: '-' },
                { name: 'playoffSeed', value: 1, displayValue: '1' },
                { name: 'streak', displayValue: 'W5' },
                { name: 'avgPointsFor', value: 119.3, displayValue: '119.3' },
                { name: 'avgPointsAgainst', value: 112.6, displayValue: '112.6' },
                { name: 'differential', value: 6.7, displayValue: '+6.7' },
              ],
            },
          ],
        },
      },
    ],
  };
  const parsed = _internal.parseStandings(raw, 2027);
  const team = parsed.conferences[0].teams[0];

  assert.equal(parsed.seasonYear, 2027);
  assert.equal(parsed.seasonLabel, '2026-27');
  assert.equal(parsed.conferences[0].name, 'Eastern Conference');
  assert.equal(team.abbreviation, 'PHI');
  assert.equal(team.seed, 1);
  assert.equal(team.wins, 8);
  assert.equal(team.losses, 1);
  assert.equal(team.gamesBehind, 0);
  assert.equal(team.streak, 'W5');
  assert.equal(team.logo, 'https://example.com/phi.png');
  closeTo(team.winPct, 0.889, 0.001);
});

test('parseLeaguePage reads opponent points and computes point differential', () => {
  const html = `
    <table id="per_game-team">
      <tbody>
        <tr>
          <td data-stat="team"><a href="/teams/HOU/2027.html">Houston Rockets</a></td>
          <td data-stat="g">8</td>
          <td data-stat="pts">119.3</td>
        </tr>
      </tbody>
      <tfoot><tr><td data-stat="team">League Average</td><td data-stat="pts">113.4</td></tr></tfoot>
    </table>
    <table id="advanced-team">
      <tbody>
        <tr>
          <td data-stat="team"><a href="/teams/HOU/2027.html">Houston Rockets</a></td>
          <td data-stat="wins">7</td>
          <td data-stat="losses">1</td>
          <td data-stat="pace">97.2</td>
          <td data-stat="off_rtg">122.6</td>
          <td data-stat="def_rtg">109.4</td>
        </tr>
      </tbody>
      <tfoot><tr><td data-stat="team">League Average</td><td data-stat="pace">99.6</td></tr></tfoot>
    </table>
    <table id="per_game-opponent">
      <tbody>
        <tr>
          <td data-stat="team"><a href="/teams/HOU/2027.html">Houston Rockets</a></td>
          <td data-stat="opp_pts">106.4</td>
        </tr>
      </tbody>
    </table>
  `;
  const parsed = _internal.parseLeaguePage(html, 2027);
  const team = parsed.teams[0];

  assert.equal(team.abbreviation, 'HOU');
  assert.equal(team.oppPpg, 106.4);
  assert.equal(team.diff, 12.9);
});

test('buildDailyLeaders ranks every category and enforces the FG% minimum', () => {
  const board = {
    date: '20261104',
    seasonYear: 2027,
    seasonLabel: '2026-27',
    games: [
      {
        id: 'g1',
        status: { state: 'in', detail: 'Q4' },
        away: { id: '1', abbreviation: 'AWY', displayName: 'Away' },
        home: { id: '2', abbreviation: 'HOM', displayName: 'Home' },
      },
      {
        id: 'g2',
        status: { state: 'post', detail: 'Final' },
        away: { id: '3', abbreviation: 'THR', displayName: 'Third' },
        home: { id: '4', abbreviation: 'FOR', displayName: 'Fourth' },
      },
    ],
  };
  const gameData = [
    {
      id: 'g1',
      away: { id: '1', abbreviation: 'AWY', displayName: 'Away' },
      home: { id: '2', abbreviation: 'HOM', displayName: 'Home' },
      status: { state: 'in', detail: 'Q4' },
      players: [
        {
          teamId: '1',
          athletes: [
            {
              id: 'p1', name: 'Alpha Guard', shortName: 'A. Guard', headshot: '', jersey: '1', position: 'G',
              stats: { min: 36, pts: 40, reb: 10, ast: 8, stl: 3, blk: 1, tpm: 5, ftm: 7, fgm: 15, fga: 20, fta: 8, tov: 4 },
            },
            {
              id: 'p2', name: 'Bench Wing', shortName: 'B. Wing', headshot: '', jersey: '2', position: 'F',
              stats: { min: 18, pts: 12, reb: 2, ast: 1, stl: 0, blk: 0, tpm: 2, ftm: 0, fgm: 1, fga: 1, fta: 0, tov: 0 },
            },
          ],
        },
      ],
    },
    {
      id: 'g2',
      away: { id: '3', abbreviation: 'THR', displayName: 'Third' },
      home: { id: '4', abbreviation: 'FOR', displayName: 'Fourth' },
      status: { state: 'post', detail: 'Final' },
      players: [
        {
          teamId: '3',
          athletes: [
            {
              id: 'p3', name: 'Beta Big', shortName: 'B. Big', headshot: '', jersey: '3', position: 'C',
              stats: { min: 38, pts: 30, reb: 18, ast: 4, stl: 1, blk: 4, tpm: 1, ftm: 5, fgm: 12, fga: 20, fta: 6, tov: 2 },
            },
          ],
        },
      ],
    },
  ];

  const result = buildDailyLeaders(gameData, board);

  assert.equal(result.date, '20261104');
  assert.equal(result.gamesCount, 2);
  assert.equal(result.liveGames, 1);
  assert.equal(result.playersCount, 3);
  assert.equal(result.categories.length, 10);
  assert.deepEqual(
    result.categories.map((category) => category.id),
    ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'ftm', 'fgPct', 'fantasy', 'tov'],
  );
  assert.equal(result.leaders.pts[0].id, 'p1');
  assert.equal(result.leaders.pts[0].value, 40);
  assert.equal(result.leaders.reb[0].id, 'p3');
  assert.equal(result.leaders.ast[0].id, 'p1');
  assert.equal(result.leaders.fantasy[0].id, 'p1');
  assert.equal(result.leaders.fantasy[0].value, 74.5);
  assert.equal(result.leaders.fgPct[0].id, 'p1');
  assert.deepEqual(result.leaders.fgPct.map((row) => row.id), ['p1', 'p3']);
  assert.equal(result.leaders.fgPct[0].display, '75.0%');
  assert.equal(result.leaders.tov[0].id, 'p1');
  assert.equal(result.leaders.pts[0].gameState, 'in');
});
