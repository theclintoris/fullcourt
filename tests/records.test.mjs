import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const records = require('../electron/records-service.cjs');
const { parseLeaderTable, normalizePlayer, normalizeSeason } = records._internal;

function table(id, headers, rows) {
  return `
    <table id="${id}">
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

test('normalizes Basketball Reference names and years', () => {
  assert.equal(normalizePlayer('Wilt Chamberlain*'), 'Wilt Chamberlain');
  assert.equal(normalizePlayer('  Kareem Abdul-Jabbar *  '), 'Kareem Abdul-Jabbar');
  assert.equal(normalizeSeason('1992', 'Year'), '1991-92');
  assert.equal(normalizeSeason('1991-92', 'Season'), '1991-92');
  assert.equal(normalizeSeason('1962', 'Season'), '1962');
});

test('parses a regular-season single-game leaderboard', () => {
  const html = table(
    'stats_game_pts',
    ['Rank', 'Player', 'PTS', 'Date', 'Tm'],
    [
      ['1.', 'Wilt Chamberlain*', '100', '1962-03-02', 'PHW'],
      ['2.', 'Bam Adebayo', '83', '2026-03-10', 'MIA'],
      ['3.', 'Kobe Bryant*', '81', '2006-01-22', 'LAL'],
    ],
  );
  const rows = parseLeaderTable(html, 'stats_game_pts', { scope: 'singleGame', stat: 'PTS' });
  assert.deepEqual(rows[0], {
    rank: 1,
    player: 'Wilt Chamberlain',
    value: 100,
    team: 'PHW',
    date: '1962-03-02',
  });
  assert.equal(rows[1].player, 'Bam Adebayo');
  assert.equal(rows[1].value, 83);
  assert.equal(rows[2].rank, 3);
});

test('parses a playoff season leaderboard and normalizes its ending year', () => {
  const html = table(
    'stats_NBA',
    ['Rank', 'Player', 'PTS', 'Year'],
    [
      ['1.', 'Michael Jordan*', '759', '1992'],
      ['2.', 'Elgin Baylor*', '713', '1962'],
    ],
  );
  const rows = parseLeaderTable(html, 'stats_NBA', { scope: 'singleSeason', stat: 'PTS' });
  assert.equal(rows[0].season, '1991-92');
  assert.equal(rows[1].season, '1961-62');
});

test('returns no rows when the required stat column is absent', () => {
  const html = table(
    'nba',
    ['Rank', 'Player', 'TRB'],
    [['1.', 'Wilt Chamberlain*', '23924']],
  );
  assert.deepEqual(parseLeaderTable(html, 'nba', { scope: 'career', stat: 'PTS' }), []);
});

test('merges live leaders with prior history without losing older records', () => {
  const prior = [
    { rank: 1, player: 'Wilt Chamberlain', value: 55, team: 'PHW', date: '1960-11-24' },
    { rank: 2, player: 'Bill Russell', value: 49, team: 'BOS', date: '1960-11-16' },
  ];
  const fresh = [
    { rank: 1, player: 'Charles Oakley', value: 35, team: 'NYK', date: '1988-04-22' },
    { rank: 2, player: 'Moses Malone', value: 34, team: 'PHI', date: '1987-03-28' },
  ];
  const merged = records._internal.mergeLeaderRows(prior, fresh, 'singleGame');
  assert.equal(merged[0].player, 'Wilt Chamberlain');
  assert.equal(merged[0].value, 55);
  assert.equal(merged[0].rank, 1);
  assert.equal(merged[1].player, 'Bill Russell');
  assert.equal(merged[2].player, 'Charles Oakley');
  assert.equal(merged[2].value, 35);
});

test('deduplicates career leaders and keeps the higher total', () => {
  const prior = [{ rank: 1, player: 'LeBron James', value: 43522 }];
  const fresh = [
    { rank: 1, player: 'LeBron James', value: 43525 },
    { rank: 2, player: 'Kareem Abdul-Jabbar', value: 38387 },
  ];
  const merged = records._internal.mergeLeaderRows(prior, fresh, 'career');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].player, 'LeBron James');
  assert.equal(merged[0].value, 43525);
  assert.equal(merged[1].rank, 2);
});
