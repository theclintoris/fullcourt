import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import index from '../src/data/player-records-index.json' with { type: 'json' };
import {
  findRecordPlayers,
  formatPlayerRecord,
  indexPlayerNames,
  playerRecordShard,
} from '../src/lib/player-records.js';

const positions = Object.fromEntries(index.metrics.map(({ id }, i) => [id, i]));
const shards = Array.from({ length: 16 }, (_, number) => JSON.parse(
  readFileSync(new URL(`../src/data/player-records/${number}.json`, import.meta.url), 'utf8'),
));
const recordFor = (id) => shards[playerRecordShard(id)][id];
const high = (profile, scope, stat) => profile[scope][1][positions[stat]]?.[0];

test('every search result resolves to a complete offline profile', () => {
  assert.ok(index.players.length > 5000);
  assert.equal(new Set(index.players.map(([id]) => id)).size, index.players.length);
  for (const [id, name] of index.players) {
    const profile = recordFor(id);
    assert.ok(profile, name);
    for (const scope of ['game', 'playoffGame', 'season', 'playoffRun']) {
      const [contexts, values] = profile[scope];
      assert.equal(values.length, index.metrics.length, name);
      assert.ok(values.every((value) => value === null || Boolean(contexts[value[1]])), name);
    }
  }
});

test('player search supports accents, aliases, reversed names and duplicate names', () => {
  const players = indexPlayerNames(index.players);
  assert.equal(findRecordPlayers(players, 'luka doncic').players[0].id, 'doncilu01');
  assert.equal(findRecordPlayers(players, 'doncic luka').players[0].id, 'doncilu01');
  assert.equal(findRecordPlayers(players, 'Jimmy Butler III').players[0].id, 'butleji01');
  const sameName = findRecordPlayers(players, 'Charles Jones').players.filter(({ name }) => name === 'Charles Jones');
  assert.ok(sameName.length > 1);
  assert.deepEqual(findRecordPlayers(players, 'zzzzzzz'), { players: [], total: 0 });
});

test('game, season, playoff run and career totals use separate scopes', () => {
  const jordan = recordFor('jordami01');
  assert.equal(high(jordan, 'game', 'pts'), 69);
  assert.equal(high(jordan, 'playoffGame', 'pts'), 63);
  assert.equal(high(jordan, 'season', 'pts'), 3041);
  assert.equal(high(jordan, 'playoffRun', 'pts'), 759);
  assert.equal(jordan.career[0][1][positions.pts], 32292);
  assert.equal(jordan.career[1][1][positions.pts], 5987);
  assert.equal(high(jordan, 'season', 'per'), 31.7);
  assert.equal(high(jordan, 'game', 'per'), undefined);
  assert.equal(high(recordFor('adebaba01'), 'game', 'pts'), 83);
});

test('field goal percentage records carry their qualifying sample', () => {
  const jordan = recordFor('jordami01');
  const [percent, , made, attempted] = jordan.game[1][positions.fgPct];
  assert.ok(attempted >= 10);
  assert.equal(percent, Math.round(1000 * made / attempted) / 10);
  assert.equal(formatPlayerRecord(0, 'percent'), '0.0%');
  assert.equal(formatPlayerRecord(null), '—');
});

test('historically unavailable counts remain absent', () => {
  const wilt = recordFor('chambwi01');
  assert.equal(high(wilt, 'game', 'pts'), 100);
  assert.equal(high(wilt, 'game', 'stl'), undefined);
  assert.equal(wilt.career[0][1][positions.blk], null);
  assert.equal(wilt.career[0][1][positions.fgm], 12681);
});
