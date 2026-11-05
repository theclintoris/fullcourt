import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCw, Trophy } from 'lucide-react';
import { useStandings } from '../hooks/useLeagueData.js';
import { currentSeasonYear, seasonOptions } from '../lib/season.js';
import { formatDecimal, formatUpdatedTime } from '../lib/format.js';
import { LeagueHeader, SeasonSelect, SourceNote } from './LeagueChrome.jsx';
import { ErrorState, LoadingLabel, Skeleton, TeamLogo } from './ui.jsx';

const SEASONS = seasonOptions(1996, currentSeasonYear());

function lastTenValue(value) {
  const [wins, losses] = String(value || '')
    .split('-')
    .map((part) => Number(part));
  const total = (wins || 0) + (losses || 0);
  return total ? (wins || 0) / total : -1;
}

function streakValue(value) {
  const match = String(value || '').match(/^([WL])(\d+)$/i);
  if (!match) return 0;
  return (match[1].toUpperCase() === 'W' ? 1 : -1) * Number(match[2]);
}

const SORT_COLUMNS = {
  seed: {
    label: '#',
    title: 'playoff seed',
    defaultDirection: 'asc',
    value: (team) => team.seed || team.playoffSeed || 99,
  },
  team: {
    label: 'Team',
    title: 'team name',
    defaultDirection: 'asc',
    value: (team) => team.displayName || team.abbreviation || '',
  },
  wins: {
    label: 'W',
    title: 'wins',
    defaultDirection: 'desc',
    value: (team) => Number(team.wins) || 0,
  },
  losses: {
    label: 'L',
    title: 'losses',
    defaultDirection: 'asc',
    value: (team) => Number(team.losses) || 0,
  },
  winPct: {
    label: 'PCT',
    title: 'win percentage',
    defaultDirection: 'desc',
    value: (team) => Number(team.winPct) || 0,
  },
  gamesBehind: {
    label: 'GB',
    title: 'games behind',
    defaultDirection: 'asc',
    value: (team) => (Number.isFinite(Number(team.gamesBehind)) ? Number(team.gamesBehind) : 99),
  },
  ppg: {
    label: 'PPG',
    title: 'points per game',
    defaultDirection: 'desc',
    value: (team) => Number(team.ppg) || 0,
  },
  oppPpg: {
    label: 'OPP',
    title: 'opponent points per game',
    defaultDirection: 'asc',
    value: (team) => Number(team.oppPpg) || 0,
  },
  diff: {
    label: 'DIFF',
    title: 'point differential',
    defaultDirection: 'desc',
    value: (team) => Number(team.diff) || 0,
  },
  streak: {
    label: 'STRK',
    title: 'current streak',
    defaultDirection: 'desc',
    value: (team) => streakValue(team.streak),
  },
  lastTen: {
    label: 'L10',
    title: 'last ten games',
    defaultDirection: 'desc',
    value: (team) => lastTenValue(team.lastTen),
  },
};

function compareTeams(a, b, sort) {
  const definition = SORT_COLUMNS[sort.key] || SORT_COLUMNS.seed;
  const aValue = definition.value(a);
  const bValue = definition.value(b);
  let result;
  if (typeof aValue === 'string' || typeof bValue === 'string') {
    result = String(aValue).localeCompare(String(bValue));
  } else {
    result = aValue - bValue;
  }
  if (result !== 0) return sort.direction === 'asc' ? result : -result;
  const seedA = a.seed || a.playoffSeed || 99;
  const seedB = b.seed || b.playoffSeed || 99;
  return seedA - seedB;
}

function SortHeader({ column, sort, onSort }) {
  const definition = SORT_COLUMNS[column];
  const active = sort.key === column;
  const direction = active ? sort.direction : null;
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`stat-sort standings-sort${active ? ' stat-sort--active' : ''}`}
        onClick={() => onSort(column)}
        title={`Sort by ${definition.title}`}
      >
        {definition.label}
        <Icon size={10} strokeWidth={2.2} />
      </button>
    </th>
  );
}

function ConferenceTable({ conference, sort, onSort }) {
  const teams = useMemo(
    () => [...(conference.teams || [])].sort((a, b) => compareTeams(a, b, sort)),
    [conference, sort],
  );

  return (
    <section className="standings-conference">
      <div className="standings-conference-head">
        <div>
          <p className="league-kicker">{conference.abbreviation || 'CONFERENCE'}</p>
          <h2>{conference.name}</h2>
        </div>
        <span>{teams.length} teams</span>
      </div>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              {Object.keys(SORT_COLUMNS).map((column) => (
                <SortHeader key={column} column={column} sort={sort} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => {
              const seed = team.seed || team.playoffSeed || index + 1;
              const isTopSix = seed <= 6;
              const isPlayIn = seed >= 7 && seed <= 10;
              return (
                <tr
                  key={team.id || team.abbreviation}
                  className={isTopSix ? 'standings-row--locked' : isPlayIn ? 'standings-row--playin' : ''}
                >
                  <td className="standings-seed">{seed}</td>
                  <td className="standings-team">
                    <TeamLogo team={team} size={24} />
                    <span>
                      <strong>{team.displayName}</strong>
                      <small>{team.abbreviation}</small>
                    </span>
                  </td>
                  <td>{team.wins}</td>
                  <td>{team.losses}</td>
                  <td>{formatDecimal(team.winPct * 100, 1)}</td>
                  <td>{team.gamesBehind ? formatDecimal(team.gamesBehind, 1) : '—'}</td>
                  <td>{formatDecimal(team.ppg, 1)}</td>
                  <td>{formatDecimal(team.oppPpg, 1)}</td>
                  <td className={team.diff >= 0 ? 'is-positive' : 'is-negative'}>
                    {team.diff > 0 ? '+' : ''}{formatDecimal(team.diff, 1)}
                  </td>
                  <td className={team.streak?.startsWith('W') ? 'is-positive' : 'is-negative'}>
                    {team.streak || '—'}
                  </td>
                  <td>{team.lastTen || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Standings({ seasonYear, onSeasonChange }) {
  const { data, meta, loading, refreshing, error, refresh } = useStandings(seasonYear);
  const [sort, setSort] = useState({ key: 'seed', direction: 'asc' });
  const leader = useMemo(() => {
    const teams = (data?.conferences || []).flatMap((conference) => conference.teams || []);
    return [...teams].sort((a, b) => b.winPct - a.winPct)[0] || null;
  }, [data]);

  const handleSort = (key) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: SORT_COLUMNS[key]?.defaultDirection || 'asc' };
    });
  };

  return (
    <div className="league-page standings-page">
      <LeagueHeader
        eyebrow="NBA · SEASON STANDINGS"
        title="The race, conference by conference"
        description="Seed lines, records, scoring margin and recent form. Click any column to sort each conference; click again to reverse. Top six are in the bracket; seeds 7–10 are the play-in."
        actions={
          <div className="league-header-action-stack">
            <SeasonSelect value={seasonYear} onChange={onSeasonChange} options={SEASONS} />
            <button type="button" className="league-refresh-button" onClick={refresh} disabled={refreshing}>
              <RotateCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      <div className="standings-feed-strip">
        <span className="standings-feed-label"><Trophy size={14} /> {data?.seasonLabel || 'NBA'}</span>
        {meta?.fetchedAt ? (
          <span>Updated {formatUpdatedTime(meta.fetchedAt)}</span>
        ) : null}
        <span className="standings-sort-status">
          Sorted by {SORT_COLUMNS[sort.key].label} {sort.direction === 'asc' ? '↑' : '↓'}
        </span>
        <span className="standings-legend">
          <i className="legend-dot legend-dot--locked" /> In bracket
          <i className="legend-dot legend-dot--playin" /> Play-in
        </span>
      </div>

      {error && !data ? (
        <ErrorState title="Standings unavailable" error={error} onRetry={refresh} />
      ) : null}
      {loading && !data ? (
        <div className="standings-loading">
          <Skeleton className="standings-loading-table" />
          <Skeleton className="standings-loading-table" />
          <LoadingLabel>Loading the standings…</LoadingLabel>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="standings-summary">
            <div>
              <span>League leader</span>
              <strong>{leader?.displayName || '—'}</strong>
            </div>
            <div>
              <span>Best record</span>
              <strong>
                {leader ? `${leader.wins}-${leader.losses}` : '—'}
              </strong>
            </div>
            <div>
              <span>Conferences</span>
              <strong>{data.conferences?.length || 0}</strong>
            </div>
            <div>
              <span>Season</span>
              <strong>{data.seasonLabel || 'NBA'}</strong>
            </div>
          </div>
          <div className="standings-grid">
            {data.conferences.map((conference) => (
              <ConferenceTable
                key={conference.abbreviation || conference.name}
                conference={conference}
                sort={sort}
                onSort={handleSort}
              />
            ))}
          </div>
          <SourceNote>
            Standings via ESPN, refreshed every minute while the page is open. Each
            conference sorts independently. Games behind reflect conference position;
            historical standings available from 1996–present.
          </SourceNote>
        </>
      ) : null}
    </div>
  );
}
