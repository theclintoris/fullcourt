const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DASH = '—';

export const NBA_TIME_ZONE = 'America/New_York';

const weekdayShort = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});
const weekdayLong = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  timeZone: 'UTC',
});
const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const monthDayLong = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
const monthShort = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});
const dayNumeric = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  timeZone: 'UTC',
});
const nbaDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: NBA_TIME_ZONE,
});

/** Parse a YYYY-MM-DD key at noon UTC so formatting never slips a day. */
export function parseDateKey(value) {
  const match = DATE_KEY_RE.exec(String(value || ''));
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(Date.UTC(2000, 0, 1, 12)) : date;
}

export function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function nbaTodayKey() {
  const parts = nbaDateKeyFormatter.formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDaysToKey(value, delta) {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDateKey(date);
}

export function formatSidebarDate(value) {
  const date = parseDateKey(value);
  return `${weekdayShort.format(date)}, ${monthDay.format(date)}`;
}

export function formatWeekday(value) {
  return weekdayShort.format(parseDateKey(value));
}

export function formatMonthDay(value) {
  return monthDay.format(parseDateKey(value));
}

export function formatLongDate(value) {
  const date = parseDateKey(value);
  return `${weekdayLong.format(date)}, ${monthDayLong.format(date)}`;
}

export function formatMonthDayParts(value) {
  const date = parseDateKey(value);
  return { month: monthShort.format(date).toUpperCase(), day: dayNumeric.format(date) };
}

export function formatDateInput(value) {
  return value || '';
}

export function inputValueToDateKey(value) {
  return DATE_KEY_RE.test(String(value || '')) ? value : '';
}

export function formatGameClock(value) {
  if (!value) return '';
  return String(value).replace(/^0:0?0$/, '0.0');
}

export function periodShort(period) {
  const number = Number(period) || 0;
  if (number <= 0) return '';
  if (number <= 4) return `Q${number}`;
  if (number === 5) return 'OT';
  return `OT${number - 4}`;
}

export function periodLabel(period) {
  const number = Number(period) || 0;
  if (number <= 0) return 'Period';
  if (number <= 4) return `${ordinal(number)} Quarter`;
  if (number === 5) return 'Overtime';
  return `${number - 4}${ordinalSuffix(number - 4)} Overtime`;
}

function ordinalSuffix(value) {
  const number = Math.abs(Number(value)) % 100;
  if (number >= 11 && number <= 13) return 'th';
  if (number % 10 === 1) return 'st';
  if (number % 10 === 2) return 'nd';
  if (number % 10 === 3) return 'rd';
  return 'th';
}

export function ordinal(value) {
  return `${value}${ordinalSuffix(value)}`;
}

export function gamePhase(game) {
  return game?.status?.state === 'in'
    ? 'live'
    : game?.status?.state === 'post'
      ? 'final'
      : 'upcoming';
}

export function isGameLive(game) {
  return gamePhase(game) === 'live';
}

export function formatTipTime(game) {
  const detail = String(game?.status?.detail || '');
  const timeMatch = detail.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
  if (timeMatch) {
    const zoneMatch = detail.match(/\b(ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT)\b/);
    return `${timeMatch[1].toUpperCase()}${zoneMatch ? ` ${zoneMatch[1].toUpperCase()}` : ''}`;
  }
  const date = new Date(game?.date || '');
  if (Number.isNaN(date.getTime())) return 'Tip time TBD';
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
  return `${time} ET`;
}

export function statusLabel(game) {
  const phase = gamePhase(game);
  if (phase === 'live') {
    const clock = formatGameClock(game.status?.clock);
    if (!clock) return periodShort(game.status?.period) || 'Live';
    return `${clock} ${periodShort(game.status?.period)}`.trim();
  }
  if (phase === 'final') {
    return game.status?.detail && /ot/i.test(game.status.detail) ? game.status.detail : 'Final';
  }
  return formatTipTime(game);
}

export function formatUpdatedTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatTimeAgo(timestamp) {
  const then = Number(timestamp) || 0;
  if (!then) return 'just now';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === '') return DASH;
  const number = Number(value);
  if (!Number.isFinite(number)) return DASH;
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDecimal(value, digits = 1) {
  if (value === null || value === undefined || value === '') return DASH;
  const number = Number(value);
  if (!Number.isFinite(number)) return DASH;
  return number.toFixed(digits);
}

/** Accepts a percentage already on a 0-100 scale. */
export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || value === '') return DASH;
  const number = Number(value);
  if (!Number.isFinite(number)) return DASH;
  return `${number.toFixed(digits)}%`;
}

/** Accepts a 0-1 fraction. */
export function formatFraction(value, digits = 1) {
  if (value === null || value === undefined || value === '') return DASH;
  const number = Number(value);
  if (!Number.isFinite(number)) return DASH;
  return `${(number * 100).toFixed(digits)}%`;
}

export function formatSigned(value, digits = 0) {
  if (value === null || value === undefined || value === '') return DASH;
  const number = Number(value);
  if (!Number.isFinite(number)) return DASH;
  const formatted = formatNumber(Math.abs(number), digits);
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `-${formatted}`;
  return formatted;
}

export function shootingLine(made, attempted, digits = 0) {
  const m = Number(made) || 0;
  const a = Number(attempted) || 0;
  if (!a) return '0-0';
  return `${m}-${a}`;
}

export function shootingPercent(made, attempted, digits = 1) {
  const m = Number(made) || 0;
  const a = Number(attempted) || 0;
  if (!a) return DASH;
  return `${((m / a) * 100).toFixed(digits)}%`;
}

export function recordLine(team) {
  const record = String(team?.record || '');
  return record ? record.replace(/^0-0$/, '') : '';
}

export function teamName(team, short = true) {
  if (!team) return 'TBD';
  return (short ? team.shortDisplayName || team.displayName : team.displayName) || 'TBD';
}

export function teamAccent(team, fallback = '#f2732c') {
  const color = String(team?.color || '');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function teamInitials(team) {
  return String(team?.abbreviation || team?.shortDisplayName || '?')
    .slice(0, 3)
    .toUpperCase();
}

export function gameHasStarted(game) {
  return ['in', 'post'].includes(game?.status?.state);
}

export function gameWinProbabilityLabel() {
  return '';
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function scoreForTeam(game, teamId) {
  if (!game || !teamId) return null;
  if (String(game.home?.id) === String(teamId)) return game.home.score;
  if (String(game.away?.id) === String(teamId)) return game.away.score;
  return null;
}

export function opponentForTeam(game, teamId) {
  if (!game) return null;
  return String(game.home?.id) === String(teamId) ? game.away : game.home;
}
