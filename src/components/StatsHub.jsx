import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  Search,
  Target,
  X,
} from 'lucide-react';
import { usePlayerStats, useTeamStats } from '../hooks/useLeagueData.js';
import { currentSeasonYear, seasonOptions } from '../lib/season.js';
import { playerEraProfile } from '../lib/era.js';
import {
  formatDecimal,
  formatNumber,
  formatPercent,
} from '../lib/format.js';
import { LeagueHeader, SeasonSelect, SourceNote } from './LeagueChrome.jsx';
import {
  ErrorState,
  LoadingLabel,
  PlayerAvatar,
  SegmentedControl,
  Skeleton,
  TeamLogo,
} from './ui.jsx';

const SEASONS = seasonOptions(1950, currentSeasonYear());
const STAT_MODES = [
  { id: 'teams', label: 'Team stats' },
  { id: 'players', label: 'Player explorer' },
];

function cellNumber(value, digits = 1) {
  return formatDecimal(value, digits);
}

function SortHeader({ column, sort, onSort }) {
  if (!column.accessor) return <th>{column.label}</th>;
  const active = sort.key === column.id;
  const ascending = active && sort.direction === 'asc';
  const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`stat-sort ${active ? 'stat-sort--active' : ''}`}
        onClick={() => onSort(column.id)}
        title={`Sort by ${column.label}${active ? ` (${sort.direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
        aria-label={`Sort by ${column.label}`}
      >
        {column.label}
        <Icon size={11} aria-hidden="true" />
      </button>
    </th>
  );
}

function EraContext({ era, seasonLabel }) {
  if (!era) return null;
  return (
    <div className="era-context-strip">
      <span className="era-context-title">{seasonLabel} league context</span>
      <span><em>Pace</em> {cellNumber(era.pace)}</span>
      <span><em>ORtg</em> {cellNumber(era.ortg)}</span>
      <span><em>TS%</em> {formatPercent(era.tsPct)}</span>
      <span><em>3PAr</em> {formatPercent(era.threePtAr)}</span>
      <span><em>FTr</em> {formatPercent(era.ftr)}</span>
      <span className="era-context-note">Era baseline · 115.0 ORtg / 57.5 TS%</span>
    </div>
  );
}

function TeamStatsView({ seasonYear }) {
  const { data, meta, loading, refreshing, error, refresh } = useTeamStats(seasonYear);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'winPct', direction: 'desc' });

  const columns = [
    {
      id: 'displayName',
      label: 'Team',
      accessor: (team) => team.displayName,
      defaultDirection: 'asc',
    },
    { id: 'wins', label: 'W', accessor: (team) => team.wins, format: (team) => formatNumber(team.wins) },
    { id: 'losses', label: 'L', accessor: (team) => team.losses, format: (team) => formatNumber(team.losses) },
    { id: 'winPct', label: 'Win%', accessor: (team) => team.winPct, format: (team) => formatDecimal(team.winPct * 100, 1) },
    { id: 'ppg', label: 'PPG', accessor: (team) => team.ppg, format: (team) => cellNumber(team.ppg) },
    { id: 'oppPpg', label: 'OPP', accessor: (team) => team.oppPpg, format: (team) => cellNumber(team.oppPpg) },
    { id: 'diff', label: 'DIFF', accessor: (team) => team.diff, format: (team) => `${team.diff > 0 ? '+' : ''}${cellNumber(team.diff)}` },
    { id: 'ortg', label: 'ORtg', accessor: (team) => team.ortg, format: (team) => cellNumber(team.ortg) },
    { id: 'drtg', label: 'DRtg', accessor: (team) => team.drtg, format: (team) => cellNumber(team.drtg), invert: true },
    { id: 'netRtg', label: 'NET', accessor: (team) => team.netRtg, format: (team) => `${team.netRtg > 0 ? '+' : ''}${cellNumber(team.netRtg)}` },
    { id: 'pace', label: 'PACE', accessor: (team) => team.pace, format: (team) => cellNumber(team.pace) },
    { id: 'tsPct', label: 'TS%', accessor: (team) => team.tsPct, format: (team) => formatPercent(team.tsPct) },
    { id: 'efgPct', label: 'eFG%', accessor: (team) => team.efgPct, format: (team) => formatPercent(team.efgPct) },
    { id: 'threePtAr', label: '3PAr', accessor: (team) => team.threePtAr, format: (team) => formatPercent(team.threePtAr) },
    { id: 'ftr', label: 'FTr', accessor: (team) => team.ftr, format: (team) => formatPercent(team.ftr) },
    { id: 'reb', label: 'REB', accessor: (team) => team.stats?.reb, format: (team) => cellNumber(team.stats?.reb) },
    { id: 'ast', label: 'AST', accessor: (team) => team.stats?.ast, format: (team) => cellNumber(team.stats?.ast) },
    { id: 'tov', label: 'TOV', accessor: (team) => team.stats?.tov, format: (team) => cellNumber(team.stats?.tov), invert: true },
  ];

  const teams = useMemo(() => {
    const filtered = (data?.teams || []).filter((team) =>
      !search || `${team.displayName} ${team.abbreviation}`.toLowerCase().includes(search.toLowerCase()),
    );
    const column = columns.find((entry) => entry.id === sort.key);
    if (!column?.accessor) return filtered;
    return filtered.sort((a, b) => {
      const aValue = column.accessor(a);
      const bValue = column.accessor(b);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (typeof aValue === 'string') return aValue.localeCompare(bValue) * direction;
      return (aValue - bValue) * direction;
    });
  }, [data, search, sort]);

  const sortColumn = columns.find((column) => column.id === sort.key) || columns[0];

  const handleSort = (key) => {
    const column = columns.find((entry) => entry.id === key);
    setSort((previous) => ({
      key,
      direction: previous.key === key
        ? (previous.direction === 'desc' ? 'asc' : 'desc')
        : (column?.defaultDirection || 'desc'),
    }));
  };

  return (
    <>
      <div className="stats-toolbar">
        <label className="stats-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Find a team"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="stats-toolbar-note" aria-live="polite">
          {teams.length} teams · {sortColumn.label} {sort.direction === 'asc' ? '↑' : '↓'}
        </span>
        {meta?.stale ? <span className="stats-stale" title={meta.warning || 'Cached league snapshot'}>cached</span> : null}
      </div>

      {meta?.stale && meta?.warning ? (
        <p className="stats-fallback-note" role="status">{meta.warning}</p>
      ) : null}

      {error && !data ? (
        <ErrorState title="Team stats unavailable" error={error} onRetry={refresh} />
      ) : null}
      {loading && !data ? (
        <div className="stats-loading">
          <Skeleton className="stats-loading-bar" />
          <Skeleton className="stats-loading-table" />
          <LoadingLabel>Reading the league ledger…</LoadingLabel>
        </div>
      ) : null}

      {data ? (
        <>
          <EraContext era={data.era} seasonLabel={data.seasonLabel} />
          <div className="stats-table-wrap">
            <table className="stats-table stats-table--teams">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <SortHeader
                      key={column.id}
                      column={column}
                      sort={sort}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.abbreviation}>
                    <td className="stats-team-cell">
                      <TeamLogo team={team} size={25} />
                      <span>
                        <strong>{team.displayName}</strong>
                        <small>{team.abbreviation}</small>
                      </span>
                    </td>
                    {columns.slice(1).map((column) => (
                      <td
                        key={column.id}
                        className={
                          column.id === 'netRtg'
                            ? `stats-number ${team.netRtg >= 0 ? 'is-positive' : 'is-negative'}`
                            : 'stats-number'
                        }
                      >
                        {column.format(team)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!teams.length ? <p className="stats-empty">No teams match that search.</p> : null}
          <SourceNote>
            Team stats and league context via Basketball Reference. {refreshing ? 'Refreshing…' : 'Cached for one hour.'}
          </SourceNote>
        </>
      ) : null}
    </>
  );
}

const PLAYER_COLUMNS = [
  { id: 'name', label: 'Player', defaultDirection: 'asc', accessor: (player) => player.name, format: (player) => player.name },
  { id: 'team', label: 'Team', defaultDirection: 'asc', accessor: (player) => player.team, format: (player) => player.team },
  { id: 'games', label: 'GP', accessor: (player) => player.games, format: (player) => formatNumber(player.games) },
  { id: 'mpg', label: 'MPG', accessor: (player) => player.mpg, format: (player) => cellNumber(player.mpg) },
  { id: 'pts', label: 'PPG', accessor: (player) => player.stats?.pts, format: (player) => cellNumber(player.stats?.pts) },
  { id: 'reb', label: 'RPG', accessor: (player) => player.stats?.reb, format: (player) => cellNumber(player.stats?.reb) },
  { id: 'ast', label: 'APG', accessor: (player) => player.stats?.ast, format: (player) => cellNumber(player.stats?.ast) },
  { id: 'stl', label: 'SPG', accessor: (player) => player.stats?.stl, format: (player) => cellNumber(player.stats?.stl) },
  { id: 'blk', label: 'BPG', accessor: (player) => player.stats?.blk, format: (player) => cellNumber(player.stats?.blk) },
  { id: 'tov', label: 'TOV', accessor: (player) => player.stats?.tov, format: (player) => cellNumber(player.stats?.tov) },
  { id: 'fgPct', label: 'FG%', accessor: (player) => player.stats?.fgPct, format: (player) => formatPercent(player.stats?.fgPct) },
  { id: 'tpPct', label: '3P%', accessor: (player) => player.stats?.tpPct, format: (player) => formatPercent(player.stats?.tpPct) },
  { id: 'ftPct', label: 'FT%', accessor: (player) => player.stats?.ftPct, format: (player) => formatPercent(player.stats?.ftPct) },
  { id: 'tsPct', label: 'TS%', accessor: (player) => player.advanced?.tsPct, format: (player) => formatPercent(player.advanced?.tsPct) },
  { id: 'usgPct', label: 'USG%', accessor: (player) => player.advanced?.usgPct, format: (player) => formatPercent(player.advanced?.usgPct) },
  { id: 'per', label: 'PER', accessor: (player) => player.advanced?.per, format: (player) => cellNumber(player.advanced?.per) },
  { id: 'ws', label: 'WS', accessor: (player) => player.advanced?.ws, format: (player) => cellNumber(player.advanced?.ws) },
  { id: 'bpm', label: 'BPM', accessor: (player) => player.advanced?.bpm, format: (player) => cellNumber(player.advanced?.bpm) },
  { id: 'vorp', label: 'VORP', accessor: (player) => player.advanced?.vorp, format: (player) => cellNumber(player.advanced?.vorp) },
];

function PlayerSeasonSheet({ player, era, seasonLabel, onClose }) {
  const closeRef = useRef(null);
  const profile = playerEraProfile(player, era);

  useEffect(() => {
    const previous = document.activeElement;
    document.body.classList.add('drawer-open');
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('drawer-open');
      document.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="season-sheet-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="player-season-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} season stats`}
      >
        <button
          ref={closeRef}
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label="Close player stats"
        >
          <X size={18} />
        </button>
        <div
          className="sheet-hero"
          style={{ '--team-color': player.team === 'TOT' ? '#f2732c' : '#3e6c92' }}
        >
          <div className="sheet-hero-copy">
            <p className="league-kicker">{seasonLabel} · player season</p>
            <h2>{player.name}</h2>
            <p>{player.teamLabel} · {player.position || '—'} · {player.age ? `${player.age} yrs` : 'Age —'}</p>
          </div>
          <PlayerAvatar player={player} size={126} />
        </div>

        <div className="sheet-body">
          <div className="sheet-section-head">
            <h3>Per game</h3>
            <span>{player.games || 0} GP · {formatDecimal(player.mpg, 1)} MPG</span>
          </div>
          <div className="sheet-stat-grid">
            {[
              ['PPG', player.stats?.pts],
              ['RPG', player.stats?.reb],
              ['APG', player.stats?.ast],
              ['SPG', player.stats?.stl],
              ['BPG', player.stats?.blk],
              ['TOV', player.stats?.tov],
            ].map(([label, value]) => (
              <div className="sheet-stat" key={label}>
                <strong>{formatDecimal(value, 1)}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="sheet-section-head">
            <h3>Shooting</h3>
            <span>per game splits</span>
          </div>
          <div className="sheet-shooting">
            <div><span>FG</span><strong>{formatDecimal(player.stats?.fgm, 1)}–{formatDecimal(player.stats?.fga, 1)}</strong><em>{formatPercent(player.stats?.fgPct)}</em></div>
            <div><span>3PT</span><strong>{formatDecimal(player.stats?.tpm, 1)}–{formatDecimal(player.stats?.tpa, 1)}</strong><em>{formatPercent(player.stats?.tpPct)}</em></div>
            <div><span>FT</span><strong>{formatDecimal(player.stats?.ftm, 1)}–{formatDecimal(player.stats?.fta, 1)}</strong><em>{formatPercent(player.stats?.ftPct)}</em></div>
          </div>

          <div className="sheet-section-head">
            <h3>Advanced</h3>
            <span>{profile?.usingEstimate ? 'per-100 estimated' : 'per-100 actual'}</span>
          </div>
          <div className="sheet-table">
            <div className="sheet-table-row sheet-table-head"><span>Metric</span><span>Value</span><span>Era</span></div>
            {[
              ['PER', formatDecimal(player.advanced?.per, 1), ''],
              ['TS%', formatPercent(player.advanced?.tsPct), profile?.adjusted?.tsPlus ? `TS+ ${formatNumber(profile.adjusted.tsPlus)}` : ''],
              ['USG%', formatPercent(player.advanced?.usgPct), ''],
              ['PTS / 100', formatDecimal(profile?.per100?.pts, 1), profile?.adjusted?.ptsPer100 ? `adj ${formatNumber(profile.adjusted.ptsPer100)}` : ''],
              ['REB / 100', formatDecimal(profile?.per100?.reb, 1), ''],
              ['AST / 100', formatDecimal(profile?.per100?.ast, 1), ''],
              ['WS', formatDecimal(player.advanced?.ws, 1), ''],
              ['BPM', formatDecimal(player.advanced?.bpm, 1), ''],
              ['VORP', formatDecimal(player.advanced?.vorp, 1), ''],
            ].map(([label, value, eraValue]) => (
              <div className="sheet-table-row" key={label}>
                <span>{label}</span><strong>{value}</strong><em>{eraValue}</em>
              </div>
            ))}
          </div>

          <div className="sheet-era-context">
            <Target size={16} />
            <span>
              {seasonLabel} league: {formatNumber(era?.ortg)} ORtg · {formatPercent(era?.tsPct)} TS ·
              {' '}{formatNumber(era?.pace)} pace
            </span>
          </div>
          <SourceNote>
            Basketball Reference season table. Era-adjusted values scale per-100 scoring to a 115.0
            ORtg baseline; TS+ indexes true shooting against the season average.
          </SourceNote>
        </div>
      </section>
    </div>
  );
}

function PlayerStatsView({ seasonYear }) {
  const { data, meta, loading, refreshing, error, refresh } = usePlayerStats(seasonYear);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'pts', direction: 'desc' });
  const [visible, setVisible] = useState(60);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const players = data?.players || [];
  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))]
      .filter((team) => team && team !== 'TOT')
      .sort(),
    [players],
  );
  const positions = useMemo(
    () => [...new Set(players.map((player) => player.position).filter(Boolean))].sort(),
    [players],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const column = PLAYER_COLUMNS.find((entry) => entry.id === sort.key);
    return players
      .filter((player) => {
        if (query) {
          const haystack = `${player.name} ${player.teamLabel} ${player.position}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (teamFilter !== 'ALL' && player.team !== teamFilter) return false;
        if (positionFilter !== 'ALL' && player.position !== positionFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (!column?.accessor) return 0;
        const aValue = column.accessor(a);
        const bValue = column.accessor(b);
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;
        const direction = sort.direction === 'asc' ? 1 : -1;
        if (typeof aValue === 'string') return aValue.localeCompare(bValue) * direction;
        return (aValue - bValue) * direction;
      });
  }, [players, search, teamFilter, positionFilter, sort]);

  useEffect(() => setVisible(60), [search, teamFilter, positionFilter, seasonYear]);

  const sortColumn = PLAYER_COLUMNS.find((column) => column.id === sort.key) || PLAYER_COLUMNS[0];

  const handleSort = (key) => {
    const column = PLAYER_COLUMNS.find((entry) => entry.id === key);
    setSort((previous) => ({
      key,
      direction: previous.key === key
        ? (previous.direction === 'desc' ? 'asc' : 'desc')
        : (column?.defaultDirection || 'desc'),
    }));
  };

  const openPlayer = (player) => {
    if (selected?.id === player.id) setExpanded((value) => !value);
    else setSelected(player);
    setExpanded(true);
  };

  return (
    <>
      <div className="stats-toolbar stats-toolbar--players">
        <label className="stats-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search players"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="stats-filter">
          <span>Team</span>
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="ALL">All teams</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        </label>
        <label className="stats-filter">
          <span>Pos</span>
          <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
            <option value="ALL">All positions</option>
            {positions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
        </label>
        <span className="stats-toolbar-note" aria-live="polite">
          {filtered.length} players · {sortColumn.label} {sort.direction === 'asc' ? '↑' : '↓'}
        </span>
        {meta?.stale ? <span className="stats-stale" title={meta.warning || 'Cached league snapshot'}>cached</span> : null}
      </div>

      {meta?.stale && meta?.warning ? (
        <p className="stats-fallback-note" role="status">{meta.warning}</p>
      ) : null}

      {error && !data ? (
        <ErrorState title="Player stats unavailable" error={error} onRetry={refresh} />
      ) : null}
      {loading && !data ? (
        <div className="stats-loading">
          <Skeleton className="stats-loading-bar" />
          <Skeleton className="stats-loading-table" />
          <LoadingLabel>Loading the player ledger…</LoadingLabel>
        </div>
      ) : null}

      {data ? (
        <>
          <EraContext era={data.era} seasonLabel={data.seasonLabel} />
          <div className="stats-table-wrap">
            <table className="stats-table stats-table--players">
              <thead>
                <tr>
                  {PLAYER_COLUMNS.map((column) => (
                    <SortHeader
                      key={column.id}
                      column={column}
                      sort={sort}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visible).map((player) => (
                  <tr
                    key={`${player.id}-${player.team}`}
                    className={selected?.id === player.id ? 'is-selected' : ''}
                    onClick={() => openPlayer(player)}
                  >
                    <td className="stats-player-cell">
                      <PlayerAvatar player={player} size={27} />
                      <span>
                        <strong>{player.name}</strong>
                        <small>{player.position || '—'} · {player.teamLabel}</small>
                      </span>
                    </td>
                    {PLAYER_COLUMNS.slice(1).map((column) => (
                      <td key={column.id} className="stats-number">{column.format(player)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stats-table-footer">
            <span>
              Showing {Math.min(visible, filtered.length)} of {filtered.length} players.
              {refreshing ? ' Refreshing…' : ''}
            </span>
            {visible < filtered.length ? (
              <button type="button" className="button button--ghost button--small" onClick={() => setVisible((value) => value + 80)}>
                Show more <ChevronDown size={14} />
              </button>
            ) : null}
          </div>
          <SourceNote>
            Per-game, advanced and per-100 data via Basketball Reference. Click a player row for
            the full season sheet. Era Lab can compare any two player-seasons.
          </SourceNote>
          {expanded && selected ? (
            <PlayerSeasonSheet
              player={selected}
              era={data.era}
              seasonLabel={data.seasonLabel}
              onClose={() => setExpanded(false)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function StatsHub({ seasonYear, onSeasonChange }) {
  const [mode, setMode] = useState('teams');

  return (
    <div className="league-page stats-page">
      <LeagueHeader
        eyebrow="NBA · LEAGUE STATS"
        title="The numbers behind the league"
        description="One ledger for every team and every player-season. Click any column header to sort; click again to reverse. Search the pool or open a player for the full statistical sheet."
        actions={<SeasonSelect value={seasonYear} onChange={onSeasonChange} options={SEASONS} />}
      />
      <div className="stats-mode-row">
        <SegmentedControl options={STAT_MODES} value={mode} onChange={setMode} ariaLabel="Stats view" />
        <span className="stats-source-badge"><BarChart3 size={13} /> Basketball Reference + ESPN</span>
      </div>
      <div className="stats-mode-content">
        {mode === 'teams' ? <TeamStatsView seasonYear={seasonYear} /> : <PlayerStatsView seasonYear={seasonYear} />}
      </div>
    </div>
  );
}
