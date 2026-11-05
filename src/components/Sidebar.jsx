import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Radio,
} from 'lucide-react';
import {
  addDaysToKey,
  formatSidebarDate,
  formatUpdatedTime,
  gamePhase,
  nbaTodayKey,
  parseDateKey,
  statusLabel,
  teamAccent,
  teamName,
  toDateKey,
} from '../lib/format.js';
import {
  LiveDot,
  SegmentedControl,
  Skeleton,
  TeamLogo,
} from './ui.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'final', label: 'Final' },
];

const STATUS_ORDER = { live: 0, upcoming: 1, final: 2 };

function sortGames(games) {
  return [...games].sort((a, b) => {
    const phaseA = gamePhase(a);
    const phaseB = gamePhase(b);
    const order = (STATUS_ORDER[phaseA] ?? 3) - (STATUS_ORDER[phaseB] ?? 3);
    if (order !== 0) return order;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function CalendarPopover({ selectedKey, onSelect, onClose }) {
  const [viewDate, setViewDate] = useState(() => {
    const date = parseDateKey(selectedKey);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  });
  const today = nbaTodayKey();

  useEffect(() => {
    const date = parseDateKey(selectedKey);
    setViewDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
  }, [selectedKey]);

  const year = viewDate.getUTCFullYear();
  const month = viewDate.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(new Date(Date.UTC(year, month, day, 12))));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(viewDate);

  const shiftMonth = (delta) => {
    setViewDate(new Date(Date.UTC(year, month + delta, 1, 12)));
  };

  return (
    <div className="calendar-popover" role="dialog" aria-label="Choose a game date">
      <div className="calendar-head">
        <div>
          <span className="eyebrow">Jump to</span>
          <strong>{monthLabel}</strong>
        </div>
        <div className="calendar-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((key, index) => {
          if (!key) return <span key={`empty-${index}`} className="calendar-empty" />;
          const day = Number(key.slice(-2));
          const isSelected = key === selectedKey;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              className={`calendar-day ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`.trim()}
              onClick={() => onSelect(key)}
              aria-label={formatSidebarDate(key)}
              aria-current={isSelected ? 'date' : undefined}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="calendar-foot">
        <button
          type="button"
          className="calendar-today-button"
          onClick={() => onSelect(today)}
        >
          Today
        </button>
        <button type="button" className="calendar-close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function RailGame({ game, active, onSelect }) {
  const phase = gamePhase(game);
  const homeScore = game.home?.score;
  const awayScore = game.away?.score;
  const awayWon = game.away?.winner;
  const homeWon = game.home?.winner;
  const isStarted = phase !== 'upcoming';
  const status = phase === 'live'
    ? statusLabel(game)
    : phase === 'final'
      ? 'Final'
      : statusLabel(game);

  return (
    <button
      type="button"
      className={`rail-game rail-game--${phase} ${active ? 'rail-game--active' : ''}`.trim()}
      onClick={() => onSelect(game.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={`${game.away?.displayName || 'Away'} at ${game.home?.displayName || 'Home'}, ${status}`}
      style={{
        '--away-color': teamAccent(game.away),
        '--home-color': teamAccent(game.home),
      }}
    >
      <span className="rail-game-top">
        <span className={`rail-status rail-status--${phase}`.trim()}>
          {phase === 'live' ? <LiveDot /> : null}
          {status}
        </span>
        <span className="rail-broadcast">{game.broadcast || 'NBA'}</span>
      </span>
      <span className="rail-team-row">
        <TeamLogo team={game.away} size={19} />
        <span className={`rail-team-name ${awayWon ? 'rail-team-name--winner' : ''}`.trim()}>
          {teamName(game.away)}
        </span>
        <span className="rail-record">{game.away?.record || ''}</span>
        <span className={`rail-score ${awayWon ? 'rail-score--winner' : ''} ${!isStarted ? 'rail-score--empty' : ''}`.trim()}>
          {isStarted ? awayScore : '–'}
        </span>
      </span>
      <span className="rail-team-row">
        <TeamLogo team={game.home} size={19} />
        <span className={`rail-team-name ${homeWon ? 'rail-team-name--winner' : ''}`.trim()}>
          {teamName(game.home)}
        </span>
        <span className="rail-record">{game.home?.record || ''}</span>
        <span className={`rail-score ${homeWon ? 'rail-score--winner' : ''} ${!isStarted ? 'rail-score--empty' : ''}`.trim()}>
          {isStarted ? homeScore : '–'}
        </span>
      </span>
    </button>
  );
}

export default function Sidebar({
  dateKey,
  onDateChange,
  scoreboard,
  loading,
  error,
  activeGameId,
  onSelectGame,
  filter,
  onFilterChange,
  meta,
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateNavRef = useRef(null);
  const today = nbaTodayKey();
  const games = useMemo(() => sortGames(scoreboard?.games || []), [scoreboard]);
  const counts = useMemo(() => ({
    all: games.length,
    live: games.filter((game) => gamePhase(game) === 'live').length,
    upcoming: games.filter((game) => gamePhase(game) === 'upcoming').length,
    final: games.filter((game) => gamePhase(game) === 'final').length,
  }), [games]);

  const visibleGames = useMemo(
    () => (filter === 'all' ? games : games.filter((game) => gamePhase(game) === filter)),
    [games, filter],
  );

  useEffect(() => {
    if (!calendarOpen) return undefined;
    const onPointerDown = (event) => {
      if (!dateNavRef.current?.contains(event.target)) setCalendarOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCalendarOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [calendarOpen]);

  const selectDate = (key) => {
    setCalendarOpen(false);
    if (key && key !== dateKey) onDateChange(key);
  };

  const filters = FILTERS.map((item) => ({ ...item, count: counts[item.id] }));

  return (
    <aside className="sidebar" aria-label="NBA schedule">
      <div className="sidebar-scroll">
        <div className="sidebar-kicker">
          <span className="eyebrow">Around the league</span>
          <span className="sidebar-game-count">{counts.all} games</span>
        </div>

        <div className="date-nav" ref={dateNavRef}>
          <button
            type="button"
            className="date-arrow"
            onClick={() => onDateChange(addDaysToKey(dateKey, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className={`date-display ${calendarOpen ? 'date-display--open' : ''}`.trim()}
            onClick={() => setCalendarOpen((open) => !open)}
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
          >
            <CalendarDays size={15} />
            <span className="date-display-copy">
              <strong>{formatSidebarDate(dateKey)}</strong>
              <span>{dateKey === today ? 'NBA today' : 'Game night'}</span>
            </span>
          </button>
          <button
            type="button"
            className="date-arrow"
            onClick={() => onDateChange(addDaysToKey(dateKey, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={17} />
          </button>
          {calendarOpen ? (
            <CalendarPopover
              selectedKey={dateKey}
              onSelect={selectDate}
              onClose={() => setCalendarOpen(false)}
            />
          ) : null}
        </div>

        {dateKey !== today ? (
          <button type="button" className="jump-today" onClick={() => selectDate(today)}>
            <Radio size={12} />
            Jump to NBA today
          </button>
        ) : null}

        <SegmentedControl
          options={filters}
          value={filter}
          onChange={onFilterChange}
          ariaLabel="Filter games by status"
          className="sidebar-filters"
        />

        <div className="rail-list" aria-label="Games for the selected date" aria-busy={loading}>
          {loading ? (
            Array.from({ length: 6 }, (_, index) => (
              <div className="rail-skeleton" key={index}>
                <Skeleton className="rail-skeleton-top" />
                <Skeleton className="rail-skeleton-row" />
                <Skeleton className="rail-skeleton-row" />
              </div>
            ))
          ) : visibleGames.length ? (
            visibleGames.map((game) => (
              <RailGame
                key={game.id}
                game={game}
                active={String(game.id) === String(activeGameId)}
                onSelect={onSelectGame}
              />
            ))
          ) : (
            <div className="rail-empty">
              <span className="rail-empty-mark">0</span>
              <strong>No {filter === 'all' ? '' : `${filter} `}games</strong>
              <p>
                {filter === 'all'
                  ? 'Nothing on the schedule for this date.'
                  : 'Try another filter or pick a new date.'}
              </p>
              {filter !== 'all' ? (
                <button type="button" onClick={() => onFilterChange('all')}>
                  View all games
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-foot-line">
          <span className={`feed-state ${error ? 'feed-state--error' : ''}`.trim()}>
            {counts.live > 0 && !error ? <LiveDot /> : <span className="feed-bullet" aria-hidden="true" />}
            {error ? 'Feed interrupted' : counts.live > 0 ? 'Live feed' : 'NBA feed'}
          </span>
          <span>{meta?.stale ? 'Cached data' : meta?.fetchedAt ? formatUpdatedTime(meta.fetchedAt) : '—'}</span>
        </div>
        <span className="sidebar-credit">Auto-updating · Data by ESPN</span>
      </div>
    </aside>
  );
}
