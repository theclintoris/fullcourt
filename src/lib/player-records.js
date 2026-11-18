const NUMBERS = new Intl.NumberFormat('en-NZ');

export function playerRecordShard(playerId) {
  return [...playerId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 16;
}

function normalizeName(value) {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/ø/g, 'o')
    .replace(/['’\.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function indexPlayerNames(players) {
  return players.map(([id, name, first, last, aliases]) => ({
    id, name, first, last, names: [name, ...aliases].map(normalizeName),
  }));
}

export function findRecordPlayers(index, query, limit = 25) {
  const name = normalizeName(query);
  if (!name) return { players: [], total: 0 };
  const tokens = name.split(' ');
  const exact = [];
  const prefix = [];
  const matches = [];
  for (const player of index) {
    if (player.names.includes(name)) {
      exact.push(player);
    } else if (player.names.some((alias) => alias.startsWith(name))) {
      prefix.push(player);
    } else if (player.names.some((alias) =>
      tokens.every((token) => alias.split(' ').some((part) => part.startsWith(token))),
    )) {
      matches.push(player);
    }
  }
  return {
    players: [...exact, ...prefix, ...matches].slice(0, limit),
    total: exact.length + prefix.length + matches.length,
  };
}

export function formatPlayerRecord(value, format = 'count') {
  if (value == null) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'decimal') return value.toFixed(1);
  return NUMBERS.format(value);
}
