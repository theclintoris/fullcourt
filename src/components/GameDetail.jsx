import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  Play,
  Trophy,
  Tv,
  Users,
} from 'lucide-react';
import {
  formatMonthDay,
  formatTipTime,
  formatUpdatedTime,
  formatWeekday,
  gamePhase,
  periodLabel,
  recordLine,
  statusLabel,
  teamName,
} from '../lib/format.js';
import {
  buildGameAnalytics,
  sortBoxPlayers,
} from '../lib/advanced.js';
import BoxScore from './BoxScore.jsx';
import PlayByPlay from './PlayByPlay.jsx';
import TeamStats from './TeamStats.jsx';
import {
  BackButton,
  EmptyState,
  ErrorState,
  LiveDot,
  RefreshButton,
  Skeleton,
  Tabs,
  TeamLogo,
} from './ui.jsx';

const LEAGUE_PASS_URL = 'https://www.nba.com/league-pass';

function venueLabel(game) {
  const venue = game?.venue;
  if (!venue) return 'Venue TBA';
  if (typeof venue === 'string') return venue;
  return [venue.name, venue.city].filter(Boolean).join(' · ') || 'Venue TBA';
}

function statusHeadline(game) {
  const phase = gamePhase(game);
  if (phase === 'live') {
    return {
      kicker: 'In progress',
      title: periodLabel(game.status?.period),
      detail: statusLabel(game),
    };
  }
  if (phase === 'final') {
    return {
      kicker: 'Final',
      title: game.status?.detail?.toLowerCase().includes('ot') ? game.status.detail : 'Final',
      detail: `${formatWeekday(game.date)} · ${formatMonthDay(game.date)}`,
    };
  }
  return {
    kicker: 'Upcoming',
    title: formatTipTime(game),
    detail: 'Tip-off',
  };
}

function topPlayer(players, key) {
  let best = null;
  for (const player of players) {
    if (!player?.stats || player.didNotPlay) continue;
    if (!best || Number(player.stats[key]) > Number(best.stats[key])) best = player;
  }
  return best && Number(best.stats[key]) > 0 ? best : null;
}

function LeaderGroup({ context, onOpenPlayer }) {
  if (!context) return null;
  const players = sortBoxPlayers(context.players);
  const categories = [
    { key: 'pts', label: 'PTS' },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
  ];
  const hasLeaders = categories.some((category) => topPlayer(players, category.key));
  if (!hasLeaders) return null;

  return (
    <div className="leaders-team">
      <div className="leaders-team-head">
        <TeamLogo team={context.team} size={20} />
        <span>{context.team?.abbreviation || teamName(context.team)}</span>
      </div>
      <div className="leaders-list">
        {categories.map((category) => {
          const leader = topPlayer(players, category.key);
          if (!leader) return null;
          return (
            <button
              type="button"
              className="leader-row"
              key={category.key}
              onClick={() => onOpenPlayer(leader.id)}
              aria-label={`Open ${leader.name}, ${leader.stats[category.key]} ${category.label}`}
            >
              <span className="leader-cat">{category.label}</span>
              <span className="leader-name">{leader.shortName || leader.name}</span>
              <span className="leader-value">{leader.stats[category.key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameLeaders({ analytics, onOpenPlayer }) {
  if (!analytics) return null;
  const contexts = Object.values(analytics.contexts);
  if (!contexts.length) return null;
  const hasAny = contexts.some((context) => topPlayer(context.players, 'pts'));
  if (!hasAny) return null;

  return (
    <div className="game-leaders">
      <div className="game-leaders-heading">
        <span className="eyebrow">Game leaders</span>
        <span className="game-leaders-note">Click a name for the full profile</span>
      </div>
      <div className="game-leaders-grid">
        {contexts.map((context) => (
          <LeaderGroup
            key={context.team?.id}
            context={context}
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </div>
    </div>
  );
}

function DetailHero({ game, onOpenPlayer, analytics }) {
  const phase = gamePhase(game);
  const status = statusHeadline(game);
  const started = phase !== 'upcoming';
  const away = game.away;
  const home = game.home;
  const awayWon = away?.winner;
  const homeWon = home?.winner;
  const officials = Array.isArray(game.officials) ? game.officials.join(', ') : '';
  const attendance = game.attendance ? game.attendance.toLocaleString('en-US') : '';

  return (
    <section
      className={`game-hero game-hero--${phase}`.trim()}
      style={{
        '--away-color': away?.color || '#f2732c',
        '--home-color': home?.color || '#f2732c',
      }}
      aria-label={`${game.away?.displayName} at ${game.home?.displayName}`}
    >
      <div className="game-hero-glow game-hero-glow--away" aria-hidden="true" />
      <div className="game-hero-glow game-hero-glow--home" aria-hidden="true" />
      <div className="game-hero-grid" aria-hidden="true" />

      <div className="game-hero-top">
        <span className={`detail-phase detail-phase--${phase}`.trim()}>
          {phase === 'live' ? <LiveDot /> : phase === 'final' ? <Trophy size={12} /> : <Clock3 size={12} />}
          {phase === 'live' ? 'Live' : phase === 'final' ? 'Final' : 'Upcoming'}
        </span>
        <span className="game-hero-top-meta">
          {game.broadcast ? (
            <span>
              <Tv size={13} />
              {game.broadcast}
            </span>
          ) : null}
          <span>
            <CalendarDays size={13} />
            {formatWeekday(game.date)} · {formatMonthDay(game.date)}
          </span>
        </span>
      </div>

      <div className="game-hero-scoreboard">
        <div className={`hero-team hero-team--away ${awayWon ? 'hero-team--winner' : ''}`.trim()}>
          <span className="hero-team-logo">
            <TeamLogo team={away} size={94} />
          </span>
          <span className="hero-team-copy">
            <span className="hero-team-location">{away?.location || teamName(away, false)}</span>
            <span className="hero-team-name">{away?.name || teamName(away, false)}</span>
            <span className="hero-team-record">{recordLine(away) || 'Away'}</span>
          </span>
        </div>

        <div className="hero-center">
          {started ? (
            <div className="hero-scoreline">
              <span className={`hero-score ${awayWon ? 'hero-score--winner' : ''}`.trim()}>
                {away?.score ?? '–'}
              </span>
              <span className="hero-score-dash">–</span>
              <span className={`hero-score ${homeWon ? 'hero-score--winner' : ''}`.trim()}>
                {home?.score ?? '–'}
              </span>
            </div>
          ) : (
            <div className="hero-pregame">
              <span className="hero-vs">VS</span>
              <span className="hero-tip">{formatTipTime(game)}</span>
            </div>
          )}
          <div className={`hero-status hero-status--${phase}`.trim()}>
            {status.kicker}
            <span className="hero-status-divider" aria-hidden="true" />
            {status.detail}
          </div>
          <div className="hero-period">{status.title}</div>
        </div>

        <div className={`hero-team hero-team--home ${homeWon ? 'hero-team--winner' : ''}`.trim()}>
          <span className="hero-team-logo">
            <TeamLogo team={home} size={94} />
          </span>
          <span className="hero-team-copy">
            <span className="hero-team-location">{home?.location || teamName(home, false)}</span>
            <span className="hero-team-name">{home?.name || teamName(home, false)}</span>
            <span className="hero-team-record">{recordLine(home) || 'Home'}</span>
          </span>
        </div>
      </div>

      <div className="game-hero-footer">
        <span>
          <MapPin size={13} />
          {venueLabel(game)}
        </span>
        {attendance ? (
          <span>
            <Users size={13} />
            {attendance}
          </span>
        ) : null}
        {officials ? <span className="game-hero-officials">Officials: {officials}</span> : null}
        {analytics ? (
          <span className="game-hero-leaders">
            {analytics.contexts[away?.id]?.team?.abbreviation || away?.abbreviation} vs{' '}
            {analytics.contexts[home?.id]?.team?.abbreviation || home?.abbreviation}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="game-detail" aria-busy="true">
      <div className="detail-toolbar">
        <Skeleton className="skeleton-back" />
        <Skeleton className="skeleton-action" />
      </div>
      <Skeleton className="skeleton-hero" />
      <Skeleton className="skeleton-table" />
    </div>
  );
}

export default function GameDetail({
  gameId,
  previewGame,
  game,
  meta,
  loading,
  refreshing,
  error,
  onRefresh,
  onBack,
  onOpenPlayer,
}) {
  const [tab, setTab] = useState('box');
  const displayGame = game || previewGame;

  const analytics = useMemo(() => (game ? buildGameAnalytics(game) : null), [game]);

  if (loading && !displayGame) return <DetailSkeleton />;

  if (!displayGame) {
    return (
      <div className="game-detail">
        <div className="detail-toolbar">
          <BackButton onClick={onBack} label="Back to slate" />
        </div>
        <ErrorState
          title="Game center unavailable"
          error={error}
          onRetry={onRefresh}
        />
      </div>
    );
  }

  const playersCount = game?.players?.reduce((sum, group) => sum + group.athletes.length, 0) || 0;
  const tabs = [
    { id: 'box', label: 'Box score', count: playersCount || undefined },
    { id: 'team', label: 'Team stats' },
    { id: 'plays', label: 'Play-by-play', count: game?.plays?.length || undefined },
  ];

  const gameReady = Boolean(game);
  const hasBoxScore = Boolean(game?.players?.length);

  return (
    <div className="game-detail">
      <div className="detail-toolbar">
        <BackButton onClick={onBack} label="Back to slate" />
        <div className="detail-toolbar-right">
          <span className="detail-updated">
            {loading && !game
              ? 'Loading game…'
              : meta?.fetchedAt
                ? `Updated ${formatUpdatedTime(meta.fetchedAt)}`
                : 'Live game data'}
            {meta?.stale ? ' · cached' : ''}
          </span>
          <a
            className="button button--ghost button--small watch-button"
            href={LEAGUE_PASS_URL}
            target="_blank"
            rel="noreferrer"
            title="Open NBA League Pass in your browser"
            aria-label={`Open NBA League Pass to watch ${teamName(displayGame.away, true)} vs ${teamName(displayGame.home, true)}`}
          >
            <Play size={13} fill="currentColor" aria-hidden="true" />
            Watch on League Pass
            <ExternalLink size={11} aria-hidden="true" />
          </a>
          <RefreshButton onClick={onRefresh} refreshing={refreshing} label="Refresh game" />
        </div>
      </div>

      {error && displayGame ? (
        <div className="data-banner" role="status">
          <span>Showing the last available game snapshot. Refresh failed.</span>
          <button type="button" onClick={onRefresh}>Try again</button>
        </div>
      ) : null}

      <DetailHero game={displayGame} analytics={analytics} onOpenPlayer={onOpenPlayer} />

      {analytics ? <GameLeaders analytics={analytics} onOpenPlayer={onOpenPlayer} /> : null}

      <div className="detail-tabs-row">
        <Tabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel={`Game ${gameId} sections`}
        />
        <span className="detail-tabs-note">Advanced stats are derived in-app</span>
      </div>

      <section className="detail-panel" role="tabpanel" aria-label={tabs.find((entry) => entry.id === tab)?.label}>
        {!gameReady && loading ? (
          <div className="detail-panel-loading">
            <Skeleton className="skeleton-table-row" />
            <Skeleton className="skeleton-table-row" />
            <Skeleton className="skeleton-table-row" />
            <Skeleton className="skeleton-table-row" />
            <Skeleton className="skeleton-table-row" />
          </div>
        ) : null}

        {!gameReady && !loading ? (
          <EmptyState
            icon={Trophy}
            title="Game details are not available yet"
            description="The box score will load as soon as the game feed publishes it."
            action={<button type="button" className="button button--ghost button--small" onClick={onRefresh}>Refresh</button>}
          />
        ) : null}

        {gameReady && !hasBoxScore && tab !== 'plays' ? (
          <EmptyState
            icon={Clock3}
            title="The box score is not out yet"
            description={`${teamName(displayGame.away)} and ${teamName(displayGame.home)} have not tipped off. Check back after the opening whistle.`}
          />
        ) : null}

        {gameReady && tab === 'box' && hasBoxScore ? (
          <BoxScore game={game} analytics={analytics} onOpenPlayer={onOpenPlayer} />
        ) : null}

        {gameReady && tab === 'team' && hasBoxScore ? (
          <TeamStats game={game} analytics={analytics} />
        ) : null}

        {gameReady && tab === 'plays' ? (
          <PlayByPlay game={game} onRefresh={onRefresh} />
        ) : null}
      </section>

      <footer className="detail-footer">
        <span>FullCourt game center</span>
        <span>Box score and play-by-play via ESPN · advanced metrics computed from the game data</span>
      </footer>
    </div>
  );
}
