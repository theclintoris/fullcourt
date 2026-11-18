import assert from 'node:assert/strict';
import test from 'node:test';
import archive from '../src/data/franchise-records.json' with { type: 'json' };
import { findSeasonRecord, franchiseSummary, winRate } from '../src/lib/franchise-records.js';

const team = (id) => archive.teams.find((entry) => entry.id === id);

test('every active franchise has a unique history through the last completed season', () => {
  assert.equal(archive.teams.length, 30);
  assert.equal(new Set(archive.teams.map(({ espnId }) => espnId)).size, 30);
  for (const franchise of archive.teams) {
    const { seasons } = franchise;
    assert.equal(seasons[0].season, archive.through, franchise.name);
    assert.deepEqual(seasons.map(({ season }) => season), [...new Set(seasons.map(({ season }) => season))].sort().reverse());
    assert.ok(seasons.every(({ wins, losses }) => wins + losses > 0), franchise.name);
  }
});

test('franchise history follows relocations and preserves the Charlotte hiatus', () => {
  assert.ok(team('OKC').seasons.some(({ team: name }) => name === 'Seattle SuperSonics'));
  assert.ok(team('CHA').seasons.some(({ season }) => season === '2001-02'));
  assert.ok(!team('CHA').seasons.some(({ season }) => ['2002-03', '2003-04'].includes(season)));
  assert.equal(team('NOH').seasons.at(-1).team, 'New Orleans Hornets');
});

test('NBA and ABA championships are counted separately', () => {
  const nets = franchiseSummary(team('NJN').seasons);
  assert.equal(nets.championships.length, 0);
  assert.equal(nets.abaChampionships.length, 2);
  assert.equal(franchiseSummary(team('BOS').seasons).championships.length, 18);
  const [knicksTitle] = franchiseSummary(team('NYK').seasons).championships;
  assert.equal(knicksTitle.season, '2025-26');
  assert.equal(knicksTitle.playoffWins, 16);
  assert.equal(knicksTitle.playoffLosses, 3);
});

test('game records include historical scoring highs, winning margins and streaks', () => {
  assert.equal(team('DET').gameRecords.points.points, 186);
  const grizzlies = team('MEM').gameRecords.margin;
  assert.equal(grizzlies.points - grizzlies.allowed, 73);
  assert.equal(team('LAL').gameRecords.winStreak.value, 33);
  const warriors = team('GSW').gameRecords.winStreak;
  assert.equal(warriors.value, 28);
  assert.equal(warriors.first, '2015-04-09');
  assert.equal(warriors.last, '2015-12-11');
});

test('season records preserve ties and skip unavailable values', () => {
  const seasons = [{ season: '2021-22', points: 101 }, { season: '2020-21', points: null }, { season: '2019-20', points: 101 }];
  assert.deepEqual(findSeasonRecord(seasons, ({ points }) => points), {
    value: 101,
    holders: [seasons[0], seasons[2]],
  });
  const warriors = team('GSW').seasons;
  const best = findSeasonRecord(warriors, ({ wins, losses }) => winRate(wins, losses));
  assert.equal(best.holders[0].season, '2015-16');
  assert.equal(best.holders[0].wins, 73);
});
