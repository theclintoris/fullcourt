import { useMemo } from 'react';
import {
  ArrowUpRight,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Trophy,
} from 'lucide-react';
import {
  addDaysToKey,
  formatLongDate,
  formatMonthDay,
  formatSidebarDate,
  formatTipTime,
  formatUpdatedTime,
  gamePhase,
  nbaTodayKey,
  statusLabel,
  teamAccent,
} from '../lib/format.js';
import {
  EmptyState,
  ErrorState,
  LiveDot,
  RefreshButton,
  SectionHeading,
  Skeleton,
  TeamLogo,
} from './ui.jsx';

const STATUS_ORDER = { live: 0, upcoming: 1, final: 2 };

function sortForBoard(games) {
  return [...games].sort((a, b) => {
    const phaseOrder = (STATUS_ORDER[gamePhase(a)] ?? 3) - (STATUS_ORDER[gamePhase(b)] ?? 3);
    if (phaseOrder !== 0) return phaseOrder;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function marginOf(game) {
  if (game.away?.score === null || game.home?.score === null) return null;
  return Math.abs(Number(game.away?.score ?? 0) - Number(game.home?.score ?? 0));
}

function pickSpotlight(games) {
  if (!games.length) return null;
  const live = games
    .filter((game) => gamePhase(game) === 'live')
    .sort((a, b) => {
      const marginDelta = (marginOf(a) ?? 99) - (marginOf(b) ?? 99);
      if (marginDelta !== 0) return marginDelta;
      return (b.status?.period || 0) - (a.status?.period || 0);
    });
  if (live.length) return live[0];

  const upcoming = games
    .filter((game) => gamePhase(game) === 'upcoming')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (upcoming.length) return upcoming[0];

  const finals = games
    .filter((game) => gamePhase(game) === 'final')
    .sort((a, b) => (marginOf(a) ?? 99) - (marginOf(b) ?? 99));
  return finals[0] || games[0];
}

function teamLocation(team) {
  if (team?.location) return team.location;
  const display = String(team?.displayName || '');
  const nickname = String(team?.name || '');
  if (nickname && display.endsWith(nickname)) return display.slice(0, -nickname.length).trim();
  return display;
}

function teamNickname(team) {
  return team?.name || team?.shortDisplayName || team?.displayName || 'NBA';
}

function venueLabel(venue) {
  if (!venue) return 'Venue TBA';
  if (typeof venue === 'string') return venue;
  return [venue.name, venue.city].filter(Boolean).join(' · ') || 'Venue TBA';
}

function spotlightReason(game) {
  const phase = gamePhase(game);
  const margin = marginOf(game);
  if (phase === 'live') {
    if (margin === 0) return 'Tied up';
    if (margin !== null && margin <= 3) return 'One-possession game';
    return margin !== null ? `${margin}-point game` : 'Live right now';
  }
  if (phase === 'upcoming') return `Tip-off ${formatTipTime(game)}`;
  if (margin !== null) return `${margin}-point finish`;
  return 'Final';
}

function SpotlightGame({ game, onOpen }) {
  if (!game) return null;
  const phase = gamePhase(game);
  const started = phase !== 'upcoming';
  const awayWon = game.away?.winner;
  const homeWon = game.home?.winner;
  const kicker = phase === 'live' ? 'Live now' : phase === 'final' ? 'Final' : 'Next up';
  const statusText = phase === 'live'
    ? statusLabel(game)
    : phase === 'final'
      ? statusLabel(game)
      : 'Tip-off';
  const odds = game.odds?.details || (game.odds?.overUnder ? `O/U ${game.odds.overUnder}` : '');
  const venue = venueLabel(game.venue);

  return (
    <button
      type="button"
      className={`spotlight-game spotlight-game--${phase}`.trim()}
      onClick={() => onOpen(game.id)}
      style={{
        '--away-color': teamAccent(game.away),
        '--home-color': teamAccent(game.home),
      }}
      aria-label={`Open ${game.away?.displayName} at ${game.home?.displayName}`}
    >
      <span className="spotlight-texture" aria-hidden="true" />
      <span className="spotlight-top">
        <span className={`spotlight-kicker spotlight-kicker--${phase}`.trim()}>
          {phase === 'live' ? <LiveDot /> : phase === 'final' ? <Trophy size={13} /> : null}
          {kicker}
        </span>
        <span className="spotlight-top-meta">
          <span>{game.broadcast || 'NBA'}</span>
          {odds ? <span className="spotlight-odds">{odds}</span> : null}
        </span>
      </span>

      <span className="spotlight-matchup">
        <span className="spotlight-team spotlight-team--away">
          <TeamLogo team={game.away} size={94} className="spotlight-logo" />
          <span className="spotlight-team-copy">
            <span className="spotlight-location">{teamLocation(game.away)}</span>
            <span className="spotlight-name">{teamNickname(game.away)}</span>
            <span className="spotlight-record">{game.away?.record || 'NBA'}</span>
          </span>
        </span>

        <span className="spotlight-center">
          {started ? (
            <span className="spotlight-scoreline" aria-label={`${game.away?.score} to ${game.home?.score}`}>
              <span className={awayWon ? 'spotlight-score--winner' : ''}>{game.away?.score ?? '–'}</span>
              <span className="spotlight-score-divider">:</span>
              <span className={homeWon ? 'spotlight-score--winner' : ''}>{game.home?.score ?? '–'}</span>
            </span>
          ) : (
            <span className="spotlight-tip">
              <span className="spotlight-tip-vs">VS</span>
              <span className="spotlight-tip-time">{formatTipTime(game)}</span>
            </span>
          )}
          <span className="spotlight-status">
            {phase === 'upcoming' ? 'Tonight' : statusText}
          </span>
          <span className="spotlight-reason">{spotlightReason(game)}</span>
        </span>

        <span className="spotlight-team spotlight-team--home">
          <TeamLogo team={game.home} size={94} className="spotlight-logo" />
          <span className="spotlight-team-copy">
            <span className="spotlight-location">{teamLocation(game.home)}</span>
            <span className="spotlight-name">{teamNickname(game.home)}</span>
            <span className="spotlight-record">{game.home?.record || 'NBA'}</span>
          </span>
        </span>
      </span>

      <span className="spotlight-mobile" aria-hidden="true">
        <span className="spotlight-mobile-team">
          <TeamLogo team={game.away} size={42} className="spotlight-mobile-logo" />
          <span className="spotlight-mobile-copy">
            <span className="spotlight-location">{teamLocation(game.away)}</span>
            <span className="spotlight-name">{teamNickname(game.away)}</span>
            <span className="spotlight-record">{game.away?.record || 'NBA'}</span>
          </span>
          <span className={`spotlight-mobile-score ${awayWon ? 'spotlight-score--winner' : ''}`.trim()}>
            {started ? game.away?.score ?? '–' : '–'}
          </span>
        </span>
        <span className="spotlight-mobile-team">
          <TeamLogo team={game.home} size={42} className="spotlight-mobile-logo" />
          <span className="spotlight-mobile-copy">
            <span className="spotlight-location">{teamLocation(game.home)}</span>
            <span className="spotlight-name">{teamNickname(game.home)}</span>
            <span className="spotlight-record">{game.home?.record || 'NBA'}</span>
          </span>
          <span className={`spotlight-mobile-score ${homeWon ? 'spotlight-score--winner' : ''}`.trim()}>
            {started ? game.home?.score ?? '–' : '–'}
          </span>
        </span>
        <span className="spotlight-mobile-meta">
          <span>{phase === 'upcoming' ? `Tonight · ${formatTipTime(game)}` : statusText}</span>
          <span>{spotlightReason(game)}</span>
        </span>
      </span>

      <span className="spotlight-footer">
        <span className="spotlight-venue">
          <MapPin size={13} />
          {venue || 'Venue TBA'}
        </span>
        <span className="spotlight-open">
          Open game center
          <ArrowUpRight size={15} />
        </span>
      </span>
    </button>
  );
}

function GameCard({ game, onOpen }) {
  const phase = gamePhase(game);
  const started = phase !== 'upcoming';
  const awayWon = game.away?.winner;
  const homeWon = game.home?.winner;
  const status = phase === 'live'
    ? statusLabel(game)
    : phase === 'final'
      ? 'Final'
      : formatTipTime(game);
  const note = phase === 'live'
    ? `${game.status?.period > 4 ? 'Overtime' : `${game.status?.period}${game.status?.period === 1 ? 'st' : game.status?.period === 2 ? 'nd' : game.status?.period === 3 ? 'rd' : 'th'} quarter`}`
    : phase === 'final'
      ? venueLabel(game.venue)
      : venueLabel(game.venue);

  return (
    <button
      type="button"
      className={`game-card game-card--${phase}`.trim()}
      onClick={() => onOpen(game.id)}
      style={{
        '--away-color': teamAccent(game.away),
        '--home-color': teamAccent(game.home),
      }}
      aria-label={`Open ${game.away?.displayName} at ${game.home?.displayName}, ${status}`}
    >
      <span className="game-card-top">
        <span className={`game-card-status game-card-status--${phase}`.trim()}>
          {phase === 'live' ? <LiveDot /> : null}
          {status}
        </span>
        <span className="game-card-broadcast">{game.broadcast || 'NBA'}</span>
      </span>

      <span className="game-card-team">
        <TeamLogo team={game.away} size={30} />
        <span className="game-card-team-copy">
          <span className={`game-card-team-name ${awayWon ? 'game-card-team-name--winner' : ''}`.trim()}>
            {game.away?.shortDisplayName || game.away?.displayName}
          </span>
          <span className="game-card-team-meta">
            {game.away?.record || 'Away'}
            <span className="game-card-separator">·</span>
            Away
          </span>
        </span>
        <span className={`game-card-score ${awayWon ? 'game-card-score--winner' : ''} ${!started ? 'game-card-score--empty' : ''}`.trim()}>
          {started ? game.away?.score : '–'}
        </span>
      </span>
      <span className="game-card-team">
        <TeamLogo team={game.home} size={30} />
        <span className="game-card-team-copy">
          <span className={`game-card-team-name ${homeWon ? 'game-card-team-name--winner' : ''}`.trim()}>
            {game.home?.shortDisplayName || game.home?.displayName}
          </span>
          <span className="game-card-team-meta">
            {game.home?.record || 'Home'}
            <span className="game-card-separator">·</span>
            Home
          </span>
        </span>
        <span className={`game-card-score ${homeWon ? 'game-card-score--winner' : ''} ${!started ? 'game-card-score--empty' : ''}`.trim()}>
          {started ? game.home?.score : '–'}
        </span>
      </span>

      <span className="game-card-footer">
        <span>{note}</span>
        <span className="game-card-open">
          Game center
          <ArrowUpRight size={13} />
        </span>
      </span>
    </button>
  );
}

function GameCenterSkeleton() {
  return (
    <div className="game-center" aria-busy="true">
      <div className="page-header">
        <div>
          <Skeleton className="skeleton-eyebrow" />
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-subline" />
        </div>
        <Skeleton className="skeleton-action" />
      </div>
      <Skeleton className="skeleton-spotlight" />
      <div className="game-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}

export default function GameCenter({
  dateKey,
  scoreboard,
  loading,
  error,
  meta,
  refreshing,
  onRefresh,
  onOpenGame,
  filter,
  onFilterChange,
  onGoToday,
  onDateChange,
}) {
  const today = nbaTodayKey();
  const allGames = scoreboard?.games || [];
  const visibleGames = useMemo(
    () => sortForBoard(
      filter === 'all' ? allGames : allGames.filter((game) => gamePhase(game) === filter),
    ),
    [allGames, filter],
  );
  const liveCount = allGames.filter((game) => gamePhase(game) === 'live').length;

  if (loading && !scoreboard) return <GameCenterSkeleton />;

  if (error && !scoreboard) {
    return (
      <div className="game-center">
        <ErrorState
          title="The league feed is unavailable"
          error={error}
          onRetry={onRefresh}
        />
      </div>
    );
  }

  const spotlight = pickSpotlight(visibleGames);
  const rest = spotlight
    ? visibleGames.filter((game) => String(game.id) !== String(spotlight.id))
    : visibleGames;
  const seasonLabel = scoreboard?.seasonLabel || '2026–27';
  const seasonType = scoreboard?.seasonType || 'Regular Season';
  const filterLabel = filter === 'live'
    ? 'Live games'
    : filter === 'upcoming'
      ? 'Upcoming games'
      : filter === 'final'
        ? 'Final games'
        : 'Full slate';

  const empty = !visibleGames.length;
  const errorBanner = error && scoreboard ? (
    <div className="data-banner" role="status">
      <span>Showing the last good snapshot. The latest refresh failed.</span>
      <button type="button" onClick={onRefresh}>Try again</button>
    </div>
  ) : null;

  return (
    <div className="game-center">
      <header className="page-header">
        <div className="page-header-copy">
          <span className="eyebrow">NBA · Game center</span>
          <h1>{formatLongDate(dateKey)}</h1>
          <p className="page-subline">
            <span>{allGames.length} {allGames.length === 1 ? 'game' : 'games'}</span>
            <span className="subline-dot" aria-hidden="true" />
            <span>{liveCount ? `${liveCount} live now` : 'No games in progress'}</span>
            <span className="subline-dot" aria-hidden="true" />
            <span>{seasonLabel} {seasonType}</span>
          </p>
        </div>
        <div className="page-header-actions">
          <div className="sync-status">
            <span className="sync-status-top">
              {liveCount > 0 ? <LiveDot /> : <span className="sync-quiet-dot" aria-hidden="true" />}
              {liveCount > 0 ? 'Live · auto-updating' : 'Auto-updating'}
            </span>
            <span className="sync-status-time">
              {meta?.fetchedAt ? `Updated ${formatUpdatedTime(meta.fetchedAt)}` : 'Connecting…'}
              {meta?.stale ? ' · cached' : ''}
            </span>
          </div>
          <RefreshButton onClick={onRefresh} refreshing={refreshing} />
        </div>
      </header>

      {onDateChange ? (
        <nav className="mobile-date-nav" aria-label="Choose a game date">
          <button
            type="button"
            onClick={() => onDateChange(addDaysToKey(dateKey, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={15} />
          </button>
          <span>{formatSidebarDate(dateKey)}</span>
          <button
            type="button"
            onClick={() => onDateChange(addDaysToKey(dateKey, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={15} />
          </button>
          {dateKey !== today ? (
            <button type="button" className="mobile-date-today" onClick={onGoToday}>
              Today
            </button>
          ) : null}
        </nav>
      ) : null}

      {errorBanner}

      {empty ? (
        <EmptyState
          icon={CalendarX2}
          title={filter === 'all' ? 'No games scheduled' : `No ${filterLabel.toLowerCase()}`}
          description={filter === 'all'
            ? 'The NBA is quiet on this date. Step back a day or jump to today.'
            : 'There are no games matching this filter on the selected date.'}
          action={(
            <div className="empty-actions">
              {filter !== 'all' ? (
                <button type="button" className="button button--primary button--small" onClick={() => onFilterChange('all')}>
                  View all games
                </button>
              ) : null}
              {dateKey !== today ? (
                <button type="button" className="button button--ghost button--small" onClick={onGoToday}>
                  Go to today
                </button>
              ) : null}
            </div>
          )}
        />
      ) : (
        <>
          <section className="spotlight-section" aria-labelledby="spotlight-heading">
            <div className="spotlight-heading">
              <span className="eyebrow" id="spotlight-heading">
                {filter === 'live' ? 'On the floor' : filter === 'final' ? 'Game of the day' : 'Spotlight'}
              </span>
              <span className="spotlight-heading-date">{formatMonthDay(dateKey)}</span>
            </div>
            <SpotlightGame game={spotlight} onOpen={onOpenGame} />
          </section>

          {rest.length ? (
            <section className="slate-section" aria-labelledby="slate-heading">
              <SectionHeading
                eyebrow={filter === 'all' ? 'Around the league' : filterLabel}
                title={filter === 'all' ? 'The rest of the slate' : 'More games'}
                description={filter === 'live'
                  ? 'Every game still on the floor.'
                  : 'Tap any matchup for the full box score and player profiles.'}
                actions={(
                  <span className="slate-count">
                    {rest.length} {rest.length === 1 ? 'game' : 'games'}
                  </span>
                )}
              />
              <div className="game-grid">
                {rest.map((game) => (
                  <GameCard key={game.id} game={game} onOpen={onOpenGame} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <footer className="page-footer">
        <span>FullCourt · an independent NBA game center</span>
        <span>Live data via ESPN</span>
      </footer>
    </div>
  );
}
