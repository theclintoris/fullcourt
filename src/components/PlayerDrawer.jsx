import { useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  CalendarDays,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  formatDecimal,
  formatMonthDay,
  formatNumber,
  formatPercent,
  formatSigned,
  gamePhase,
  shootingPercent,
  teamAccent,
  teamName,
} from '../lib/format.js';
import {
  aggregateGameStats,
  buildGameAnalytics,
  playerGameAdvanced,
  seasonAdvanced,
} from '../lib/advanced.js';
import { usePlayer } from '../hooks/useNbaData.js';
import {
  EmptyState,
  ErrorState,
  PlayerAvatar,
  Skeleton,
  TeamLogo,
} from './ui.jsx';

function opposingTeam(game, teamId) {
  if (!game) return null;
  return String(game.away?.id) === String(teamId) ? game.home : game.away;
}

function Sparkline({ values, color = '#f2732c' }) {
  if (!values.length) return null;
  const width = 340;
  const height = 72;
  const paddingX = 8;
  const paddingY = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(1, values.length - 1);
    const y = height - paddingY - ((value - min) / span) * (height - paddingY * 2);
    return { x, y, value };
  });
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height - paddingY} L ${points[0].x.toFixed(1)} ${height - paddingY} Z`;

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Points in the last ${values.length} games: ${values.join(', ')}`}>
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.x}-${index}`}>
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2.8} fill={index === points.length - 1 ? color : '#10141c'} stroke={color} strokeWidth="2" />
            <title>{`${point.value} points`}</title>
          </g>
        ))}
      </svg>
      <div className="sparkline-axis">
        <span>{min} PTS</span>
        <span>{max} PTS</span>
      </div>
    </div>
  );
}

function CurrentGameSection({ game, entry, analytics }) {
  if (!game) return null;
  const phase = gamePhase(game);
  if (!analytics && phase === 'upcoming') return null;
  const player = entry?.player;
  const stats = player?.stats;
  const team = entry?.team;
  const opponent = entry?.opponent || opposingTeam(game, team?.id);

  if (!analytics) {
    return (
      <section className="drawer-section drawer-section--tonight">
        <div className="drawer-section-head">
          <div>
            <span className="eyebrow">Tonight</span>
            <h3>Game line</h3>
          </div>
        </div>
        <div className="drawer-inline-loading">
          <Skeleton className="skeleton-line" />
          <Skeleton className="skeleton-line skeleton-line--short" />
        </div>
      </section>
    );
  }

  if (!player || !stats || player.didNotPlay) {
    return (
      <section className="drawer-section drawer-section--tonight">
        <div className="drawer-section-head">
          <div>
            <span className="eyebrow">Tonight</span>
            <h3>{opponent ? `vs ${teamName(opponent, true)}` : 'Game line'}</h3>
          </div>
          <span className={`drawer-phase drawer-phase--${phase}`.trim()}>{game.status?.detail || 'Game'}</span>
        </div>
        <div className="drawer-dnp">
          <span>Did not play{player?.reason ? ` · ${player.reason}` : ''}</span>
          <p>The player did not record a line in this game.</p>
        </div>
      </section>
    );
  }

  const advanced = playerGameAdvanced(stats, entry.teamContext, analytics.gameTotals);
  const plusMinusClass = Number(stats.plusMinus) > 0
    ? 'drawer-plus--positive'
    : Number(stats.plusMinus) < 0
      ? 'drawer-plus--negative'
      : '';
  const gameScore = game.away?.score !== null && game.home?.score !== null
    ? `${game.away?.abbreviation} ${game.away?.score} – ${game.home?.score} ${game.home?.abbreviation}`
    : '';
  const clockText = String(game.status?.clock || '').trim();
  const liveLabel = clockText && !/^0(:00)?(\.0+)?$/.test(clockText)
    ? clockText
    : game.status?.detail || 'Live';

  return (
    <section className="drawer-section drawer-section--tonight">
      <div className="drawer-section-head">
        <div>
          <span className="eyebrow">Tonight</span>
          <h3>
            {opponent ? (
              <>
                <span className="drawer-opp-prefix">{game.away?.id === team?.id ? 'at' : 'vs'}</span>
                {' '}
                {teamName(opponent, true)}
              </>
            ) : 'Game line'}
          </h3>
        </div>
        <span className={`drawer-phase drawer-phase--${phase}`.trim()}>
          {phase === 'live' ? liveLabel : game.status?.detail || 'Final'}
        </span>
      </div>
      <div className="drawer-game-strip">
        <span>{gameScore}</span>
        <span>{game.status?.detail || ''}</span>
      </div>

      <div className="drawer-stat-grid drawer-stat-grid--five">
        <div className="drawer-stat">
          <strong>{formatNumber(stats.pts)}</strong>
          <span>PTS</span>
        </div>
        <div className="drawer-stat">
          <strong>{formatNumber(stats.reb)}</strong>
          <span>REB</span>
        </div>
        <div className="drawer-stat">
          <strong>{formatNumber(stats.ast)}</strong>
          <span>AST</span>
        </div>
        <div className="drawer-stat">
          <strong>{formatDecimal(stats.min, 0)}</strong>
          <span>MIN</span>
        </div>
        <div className={`drawer-stat ${plusMinusClass}`.trim()}>
          <strong>{formatSigned(stats.plusMinus)}</strong>
          <span>+/-</span>
        </div>
      </div>

      <div className="drawer-shooting">
        <div>
          <span>FG</span>
          <strong>{stats.fg || '0-0'}</strong>
          <em>{shootingPercent(stats.fgm, stats.fga)}</em>
        </div>
        <div>
          <span>3PT</span>
          <strong>{stats.threePt || '0-0'}</strong>
          <em>{shootingPercent(stats.tpm, stats.tpa)}</em>
        </div>
        <div>
          <span>FT</span>
          <strong>{stats.ft || '0-0'}</strong>
          <em>{shootingPercent(stats.ftm, stats.fta)}</em>
        </div>
        <div>
          <span>OREB / DREB</span>
          <strong>{stats.oreb ?? 0} / {stats.dreb ?? 0}</strong>
          <em>{formatNumber(stats.stl)} STL · {formatNumber(stats.blk)} BLK</em>
        </div>
      </div>

      <div className="drawer-advanced-head">
        <span className="eyebrow">Game advanced</span>
        <span>{formatPercent(advanced?.ts)} true shooting</span>
      </div>
      <div className="drawer-metrics">
        <div className="drawer-metric">
          <span>TS%</span>
          <strong>{formatPercent(advanced?.ts)}</strong>
        </div>
        <div className="drawer-metric">
          <span>eFG%</span>
          <strong>{formatPercent(advanced?.efg)}</strong>
        </div>
        <div className="drawer-metric">
          <span>USG%</span>
          <strong>{formatPercent(advanced?.usg)}</strong>
        </div>
        <div className="drawer-metric">
          <span>PIE</span>
          <strong>{formatDecimal(advanced?.pie, 1)}</strong>
        </div>
        <div className="drawer-metric">
          <span>AST%</span>
          <strong>{formatPercent(advanced?.astPct)}</strong>
        </div>
        <div className="drawer-metric">
          <span>REB%</span>
          <strong>{formatPercent(advanced?.rebPct)}</strong>
        </div>
      </div>
      <div className="drawer-game-score">
        <span>Game score</span>
        <strong>{formatDecimal(advanced?.gameScore, 1)}</strong>
        <em>{formatDecimal(advanced?.pointsPerShot, 2)} points per shot</em>
      </div>
    </section>
  );
}

function SeasonSection({ profile }) {
  const season = profile?.season;
  const seasonTeam = profile?.team || {};
  if (!season?.averages) {
    return (
      <section className="drawer-section">
        <div className="drawer-section-head">
          <div>
            <span className="eyebrow">Season</span>
            <h3>2026–27</h3>
          </div>
        </div>
        <p className="drawer-muted">Season averages are not available for this player yet.</p>
      </section>
    );
  }

  const averages = season.averages;
  const advanced = seasonAdvanced(averages, season.misc);
  const per36 = advanced?.per36;

  return (
    <section className="drawer-section">
      <div className="drawer-section-head">
        <div>
          <span className="eyebrow">Season · {season.label}</span>
          <h3>{seasonTeam?.abbreviation ? `${seasonTeam.abbreviation} averages` : 'Season averages'}</h3>
        </div>
        <span className="drawer-season-gp">{formatNumber(averages.gp)} GP</span>
      </div>

      <div className="drawer-season-primary">
        <div>
          <strong>{formatDecimal(averages.pts, 1)}</strong>
          <span>PPG</span>
        </div>
        <div>
          <strong>{formatDecimal(averages.reb, 1)}</strong>
          <span>RPG</span>
        </div>
        <div>
          <strong>{formatDecimal(averages.ast, 1)}</strong>
          <span>APG</span>
        </div>
        <div>
          <strong>{formatDecimal(averages.min, 1)}</strong>
          <span>MPG</span>
        </div>
      </div>

      <div className="drawer-season-meta">
        <span><em>GP</em>{formatNumber(averages.gp)}</span>
        <span><em>GS</em>{formatNumber(averages.gs)}</span>
        <span><em>STL</em>{formatDecimal(averages.stl, 1)}</span>
        <span><em>BLK</em>{formatDecimal(averages.blk, 1)}</span>
        <span><em>TO</em>{formatDecimal(averages.tov, 1)}</span>
        <span><em>PF</em>{formatDecimal(averages.pf, 1)}</span>
      </div>

      <div className="drawer-season-shooting">
        <div>
          <span>FG%</span>
          <strong>{formatPercent(averages.fgPct)}</strong>
          <em>{averages.fgm}-{averages.fga}</em>
        </div>
        <div>
          <span>3PT%</span>
          <strong>{formatPercent(averages.tpPct)}</strong>
          <em>{averages.tpm}-{averages.tpa}</em>
        </div>
        <div>
          <span>FT%</span>
          <strong>{formatPercent(averages.ftPct)}</strong>
          <em>{averages.ftm}-{averages.fta}</em>
        </div>
      </div>

      <div className="drawer-season-advanced">
        <div>
          <span>True shooting</span>
          <strong>{formatPercent(advanced?.ts)}</strong>
        </div>
        <div>
          <span>Effective FG</span>
          <strong>{formatPercent(advanced?.efg)}</strong>
        </div>
        <div>
          <span>AST / TO</span>
          <strong>{formatDecimal(advanced?.astTo, 2)}</strong>
        </div>
        <div>
          <span>FT rate</span>
          <strong>{formatPercent(advanced?.ftRate)}</strong>
        </div>
        <div>
          <span>3PA / FGA</span>
          <strong>{formatPercent(advanced?.threePtRate)}</strong>
        </div>
        <div>
          <span>PTS / 36</span>
          <strong>{formatDecimal(per36?.pts, 1)}</strong>
        </div>
      </div>
      <p className="drawer-mini-note">
        TS% and eFG% derived from season averages. Per-36 and efficiency values use the same
        season sample.
      </p>
    </section>
  );
}

function LastFiveSection({ games, loading, error, color }) {
  const visible = (games || []).filter((game) => game.stats).slice(0, 5);
  const aggregate = aggregateGameStats(visible);

  return (
    <section className="drawer-section">
      <div className="drawer-section-head">
        <div>
          <span className="eyebrow">Form</span>
          <h3>Last five games</h3>
        </div>
        <span className="drawer-section-icon"><TrendingUp size={15} /></span>
      </div>

      {loading ? (
        <div className="drawer-chart-loading">
          <Skeleton className="skeleton-chart" />
          <Skeleton className="skeleton-line" />
        </div>
      ) : null}

      {!loading && error ? (
        <p className="drawer-muted">The game log is unavailable right now.</p>
      ) : null}

      {!loading && !error && !visible.length ? (
        <p className="drawer-muted">No games with stats in the recent log.</p>
      ) : null}

      {!loading && !error && visible.length ? (
        <>
          <div className="drawer-form-summary">
            <div className="drawer-form-points">
              <strong>{formatDecimal(aggregate.pts / aggregate.games, 1)}</strong>
              <span>PTS over last {aggregate.games}</span>
            </div>
            <div className="drawer-form-splits">
              <span>{formatDecimal(aggregate.reb / aggregate.games, 1)} REB</span>
              <span>{formatDecimal(aggregate.ast / aggregate.games, 1)} AST</span>
              <span>{formatPercent(aggregate.ts)} TS%</span>
            </div>
          </div>
          <Sparkline values={visible.map((game) => Number(game.stats.pts) || 0)} color={color} />
          <div className="game-log">
            <div className="game-log-head">
              <span>Game</span>
              <span>MIN</span>
              <span>PTS</span>
              <span>REB</span>
              <span>AST</span>
            </div>
            {visible.map((game) => (
              <div className="game-log-row" key={game.id}>
                <span className="game-log-game">
                  <TeamLogo
                    team={{ abbreviation: game.opponentAbbreviation, logo: game.opponentLogo }}
                    size={22}
                  />
                  <span>
                    <strong>{game.atVs || '@'} {game.opponentAbbreviation}</strong>
                    <em>{formatMonthDay(game.date)} · {game.result || '—'}</em>
                  </span>
                </span>
                <span>{formatDecimal(game.stats.min, 0)}</span>
                <span className="game-log-points">{formatNumber(game.stats.pts)}</span>
                <span>{formatNumber(game.stats.reb)}</span>
                <span>{formatNumber(game.stats.ast)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function BioSection({ profile }) {
  if (!profile) return null;
  const bio = [
    { label: 'Age', value: profile.age ? `${profile.age}` : null },
    { label: 'Height', value: profile.height },
    { label: 'Weight', value: profile.weight },
    { label: 'Experience', value: profile.experience },
    { label: 'Birthplace', value: profile.birthPlace },
    { label: 'Draft', value: profile.draft },
    { label: 'Born', value: profile.dateOfBirth },
    { label: 'Status', value: profile.active === false ? 'Inactive' : 'Active' },
  ].filter((item) => item.value);

  return (
    <section className="drawer-section">
      <div className="drawer-section-head">
        <div>
          <span className="eyebrow">Profile</span>
          <h3>About</h3>
        </div>
        <span className="drawer-section-icon"><CalendarDays size={15} /></span>
      </div>
      {profile.summary ? <p className="drawer-bio-summary">{profile.summary}</p> : null}
      {bio.length ? (
        <div className="bio-grid">
          {bio.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="drawer-loading">
      <Skeleton className="skeleton-drawer-block" />
      <Skeleton className="skeleton-drawer-block" />
      <Skeleton className="skeleton-drawer-block skeleton-drawer-block--short" />
    </div>
  );
}

export default function PlayerDrawer({
  playerId,
  game,
  previewGame,
  seasonYear,
  onClose,
}) {
  const { profile, games, loading, gamesLoading, error, gamesError, retry } = usePlayer(playerId, seasonYear);
  const closeRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        previousFocus.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const analytics = useMemo(() => {
    const source = game || previewGame;
    return source && source.players ? buildGameAnalytics(source) : null;
  }, [game, previewGame]);

  const entry = analytics?.playerIndex.get(String(playerId)) || null;
  const livePlayer = entry?.player || null;
  const displayPlayer = profile || livePlayer || {};
  const team = entry?.team || profile?.team || {};
  const color = teamAccent(team);
  const name = displayPlayer.name || displayPlayer.shortName || 'Player profile';
  const seasonLabel = profile?.season?.label || (seasonYear ? `${seasonYear - 1}–${String(seasonYear).slice(-2)}` : '2026–27');
  const phase = game ? gamePhase(game) : null;
  const heroStatus = phase === 'live'
    ? game?.status?.detail || 'Live'
    : phase === 'final'
      ? 'Final'
      : phase === 'upcoming'
        ? 'Upcoming'
        : '';

  return (
    <div className="drawer-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="player-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} player profile`}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ '--player-accent': color }}
      >
        <div className="drawer-hero">
          <div className="drawer-hero-wash" aria-hidden="true" />
          <div className="drawer-hero-lines" aria-hidden="true" />
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close player profile"
            ref={closeRef}
          >
            <X size={18} />
          </button>

          <div className="drawer-identity">
            <div className="drawer-name-block">
              <span className="eyebrow drawer-eyebrow">
                <span className="drawer-accent-dot" />
                Player profile {heroStatus ? `· ${heroStatus}` : ''}
              </span>
              <h2>{name}</h2>
              <div className="drawer-subtitle">
                {team?.abbreviation ? (
                  <span className="drawer-team">
                    <TeamLogo team={team} size={20} />
                    {team.displayName || teamName(team, false)}
                  </span>
                ) : null}
                <span>{displayPlayer.positionName || displayPlayer.position || '—'}</span>
                {displayPlayer.jersey ? <span>#{displayPlayer.jersey}</span> : null}
              </div>
              <div className="drawer-chips">
                {displayPlayer.height ? <span>{displayPlayer.height}</span> : null}
                {displayPlayer.weight ? <span>{displayPlayer.weight}</span> : null}
                {displayPlayer.age ? <span>{displayPlayer.age} years old</span> : null}
                {displayPlayer.experience ? <span>{displayPlayer.experience}</span> : null}
              </div>
            </div>
            <div className="drawer-portrait-wrap">
              <span className="drawer-jersey-watermark" aria-hidden="true">
                {displayPlayer.jersey || ''}
              </span>
              <PlayerAvatar player={displayPlayer} size={170} className="drawer-portrait" eager />
            </div>
          </div>

          <div className="drawer-hero-footer">
            <span><Activity size={13} /> {seasonLabel} season</span>
            {game ? (
              <span className="drawer-hero-game">
                {game.away?.abbreviation} {game.away?.score ?? '—'} – {game.home?.score ?? '—'} {game.home?.abbreviation}
              </span>
            ) : null}
            <span className="drawer-hero-note">Click outside or press Esc to close</span>
          </div>
        </div>

        <div className="drawer-body">
          {loading && !profile ? (
            <>
              <CurrentGameSection game={game || previewGame} entry={entry} analytics={analytics} />
              <DrawerSkeleton />
            </>
          ) : null}

          {!loading && error && !profile ? (
            <div className="drawer-error">
              <ErrorState
                title="Player profile unavailable"
                error={error}
                onRetry={retry}
                compact
              />
            </div>
          ) : null}

          {profile ? (
            <>
              <CurrentGameSection game={game || previewGame} entry={entry} analytics={analytics} />
              <SeasonSection profile={profile} />
              <LastFiveSection
                games={games?.games}
                loading={gamesLoading}
                error={gamesError}
                color={color}
              />
              <BioSection profile={profile} />
            </>
          ) : null}

          {!loading && !profile && !error ? (
            <EmptyState
              icon={Activity}
              title="No profile data"
              description="ESPN did not return a profile for this player."
              action={<button type="button" className="button button--ghost button--small" onClick={retry}>Try again</button>}
              compact
            />
          ) : null}

          <p className="drawer-footnote">
            Profile and season data via ESPN. Advanced metrics are computed in-app from the
            available box score and season averages.
          </p>
        </div>
      </aside>
    </div>
  );
}
