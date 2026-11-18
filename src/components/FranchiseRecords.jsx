import { useState } from 'react';
import { ChevronDown, Search, Trophy } from 'lucide-react';
import archive from '../data/franchise-records.json';
import { useStandings } from '../hooks/useLeagueData.js';
import { currentSeasonYear, seasonLabelFor } from '../lib/season.js';
import {
  findSeasonRecord,
  formatRecord,
  formatWinRate,
  franchiseSummary,
  PER_GAME_STATS,
  winRate,
} from '../lib/franchise-records.js';
import { SourceNote } from './LeagueChrome.jsx';
import { TeamLogo } from './ui.jsx';

const FRANCHISES = archive.teams.map((team) => ({
  ...team,
  abbreviation: team.logoCode.toUpperCase(),
  logo: `https://a.espncdn.com/i/teamlogos/nba/500/${team.logoCode}.png`,
  formerNames: [...new Set(team.seasons.map((season) => season.team))].filter((name) => name !== team.name),
}));

const SEASON_MARKS = [
  { label: 'Most wins', getValue: (season) => season.wins },
  { label: 'Highest win %', getValue: (season) => winRate(season.wins, season.losses), format: formatWinRate },
  { label: 'Most losses', getValue: (season) => season.losses },
  ...PER_GAME_STATS.map(({ key, label }) => ({
    label,
    getValue: (season) => season[key],
    format: (value) => value.toFixed(1),
  })),
];

const HISTORY_VIEWS = [
  { id: 'results', label: 'All seasons' },
  { id: 'playoffs', label: 'Playoff seasons' },
  { id: 'stats', label: 'Per-game stats' },
];

const RECORD_DATE = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function recordDate(date) {
  return RECORD_DATE.format(new Date(`${date}T00:00:00Z`));
}

function FranchisePicker({ selected, onSelect }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = FRANCHISES.filter((team) =>
    [team.name, team.id, team.abbreviation, ...team.formerNames]
      .some((name) => name.toLowerCase().includes(query)),
  );

  return (
    <aside className="franchise-directory" aria-label="Franchise directory">
      <label className="franchise-select">
        <span>Franchise</span>
        <select value={selected.id} onChange={(event) => onSelect(event.target.value)}>
          {FRANCHISES.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <ChevronDown size={17} aria-hidden="true" />
      </label>
      <div className="franchise-directory-desktop">
        <div className="franchise-directory-head">
          <h2>Franchises</h2>
          <span>{FRANCHISES.length} teams</span>
        </div>
        <label className="stats-search franchise-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a franchise"
            placeholder="Find a franchise"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="franchise-directory-list">
          {matches.map((team) => (
            <button
              className="franchise-option"
              type="button"
              key={team.id}
              aria-pressed={team.id === selected.id}
              onClick={() => onSelect(team.id)}
            >
              <TeamLogo team={team} size={25} />
              <span>{team.name}</span>
            </button>
          ))}
          {matches.length === 0 ? <p className="franchise-no-match" role="status">No matching franchises.</p> : null}
        </div>
      </div>
    </aside>
  );
}

function FranchiseOverview({ team, summary, currentRecord, seasonLabel, currentRecordStale }) {
  const { wins, losses, playoffWins, playoffLosses, championships, abaChampionships, playoffTrips } = summary;
  const first = team.seasons.at(-1).season;

  return (
    <header className="franchise-overview" style={{ '--franchise-color': team.color }}>
      <div className="franchise-identity">
        <TeamLogo team={team} size={76} className="franchise-crest" />
        <div>
          <p className="franchise-conference">{team.conference === 'East' ? 'Eastern' : 'Western'} Conference</p>
          <h2>{team.name}</h2>
          <p className="franchise-span">{first} to {archive.through} · {team.seasons.length} completed seasons</p>
        </div>
      </div>
      <dl className="franchise-totals">
        <div><dt>All-time W–L</dt><dd>{formatRecord(wins, losses)}</dd></div>
        <div><dt>Win %</dt><dd>{formatWinRate(winRate(wins, losses))}</dd></div>
        <div>
          <dt>Playoff W–L</dt>
          <dd>{formatRecord(playoffWins, playoffLosses)}</dd>
          <dd className="franchise-playoff-trips">{playoffTrips} trips</dd>
        </div>
        <div><dt>NBA titles</dt><dd>{championships.length}</dd></div>
      </dl>
      {currentRecord ? (
        <div className="franchise-current">
          <span>{seasonLabel} regular season{currentRecordStale ? ' · last saved' : ''}</span>
          <strong>{formatRecord(currentRecord.wins, currentRecord.losses)}</strong>
        </div>
      ) : null}
      {championships.length > 0 || abaChampionships.length > 0 ? (
        <div className="franchise-titles">
          <Trophy size={16} aria-hidden="true" />
          <dl>
            {championships.length ? (
              <div><dt>NBA titles</dt><dd>{championships.map(({ season }) => season).join(', ')}</dd></div>
            ) : null}
            {abaChampionships.length ? (
              <div><dt>ABA titles</dt><dd>{abaChampionships.map(({ season }) => season).join(', ')}</dd></div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </header>
  );
}

function GameMarks({ records }) {
  const scoreDetail = ({ points, allowed, date, opponent, league }) => [
    `${formatRecord(points, allowed)} vs. ${opponent}`,
    `${recordDate(date)}${league === 'NBA' ? '' : ` · ${league}`}`,
  ];
  const streakDetail = ({ first, last }) => [`${recordDate(first)} to ${recordDate(last)}`];
  const marks = [
    { label: 'Most points', value: records.points.points, detail: scoreDetail(records.points) },
    { label: 'Largest win', value: `+${records.margin.points - records.margin.allowed}`, detail: scoreDetail(records.margin) },
    { label: 'Longest win streak', value: records.winStreak.value, detail: streakDetail(records.winStreak) },
    { label: 'Longest loss streak', value: records.lossStreak.value, detail: streakDetail(records.lossStreak) },
  ];

  return (
    <section className="franchise-section" aria-labelledby="franchise-game-marks">
      <h3 id="franchise-game-marks">Game records</h3>
      <dl className="franchise-marks-grid franchise-marks-grid--games">
        {marks.map(({ label, value, detail }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <dd className="franchise-mark-seasons">{detail.map((line) => <span key={line}>{line}</span>)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SeasonMarks({ seasons }) {
  return (
    <section className="franchise-section" aria-labelledby="franchise-marks">
      <h3 id="franchise-marks">Single-season records</h3>
      <dl className="franchise-marks-grid">
        {SEASON_MARKS.map(({ label, getValue, format = String }) => {
          const record = findSeasonRecord(seasons, getValue);
          if (!record) return null;
          return (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{format(record.value)}</dd>
              <dd className="franchise-mark-seasons">
                {record.holders.map(({ season }) => season).join(', ')}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function SeasonHistory({ team }) {
  const [view, setView] = useState('results');
  const showStats = view === 'stats';
  const seasons = view === 'playoffs' ? team.seasons.filter((season) => season.playoffs) : team.seasons;

  return (
    <section className="franchise-section" aria-labelledby="franchise-history">
      <h3 id="franchise-history">Season history</h3>
      <div className="franchise-history-controls" role="group" aria-label="Season history view">
        {HISTORY_VIEWS.map(({ id, label }) => (
          <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="franchise-table-wrap" tabIndex={0} role="region" aria-label={`${team.name} season history`}>
        <table className="franchise-table">
          <thead>
            <tr>
              <th scope="col">Season</th>
              <th scope="col">Team</th>
              {showStats ? PER_GAME_STATS.map(({ key, abbreviation, label }) => (
                <th scope="col" key={key} title={label}>{abbreviation}</th>
              )) : (
                <>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                  <th scope="col">Win %</th>
                  <th scope="col">Playoff W–L</th>
                  <th scope="col" className="franchise-playoff-result">Playoff result</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) => (
              <tr key={season.season} className={season.playoffs === 'Champions' ? 'is-champion' : ''}>
                <th scope="row">{season.season}</th>
                <td>{season.team}{season.league !== 'NBA' ? <small> {season.league}</small> : null}</td>
                {showStats ? PER_GAME_STATS.map(({ key }) => (
                  <td key={key}>{season[key]?.toFixed(1) ?? '—'}</td>
                )) : (
                  <>
                    <td>{season.wins}</td>
                    <td>{season.losses}</td>
                    <td>{formatWinRate(winRate(season.wins, season.losses))}</td>
                    <td>{season.playoffs ? formatRecord(season.playoffWins, season.playoffLosses) : '—'}</td>
                    <td className="franchise-playoff-result">{season.playoffs || 'Missed playoffs'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function FranchiseRecords({ selectedId, onSelect }) {
  const seasonYear = currentSeasonYear();
  const seasonLabel = seasonLabelFor(seasonYear);
  const { data, meta, error } = useStandings(seasonYear);
  const team = FRANCHISES.find(({ id }) => id === selectedId) || FRANCHISES[0];
  const summary = franchiseSummary(team.seasons);
  const currentRecord = seasonLabel > archive.through && data?.seasonLabel === seasonLabel
    ? data.conferences.flatMap(({ teams }) => teams).find(({ id }) => id === team.espnId)
    : null;

  return (
    <>
      <div className="franchise-layout">
        <FranchisePicker selected={team} onSelect={onSelect} />
        <div className="franchise-content">
          <FranchiseOverview
            team={team}
            summary={summary}
            currentRecord={currentRecord}
            currentRecordStale={meta?.stale || Boolean(error)}
            seasonLabel={seasonLabel}
          />
          <SeasonMarks seasons={team.seasons} />
          <GameMarks records={team.gameRecords} />
          <SeasonHistory team={team} />
        </div>
      </div>
      <SourceNote>
        The archive covers completed NBA, BAA and ABA seasons through {archive.through}.
        Game records are for the regular season. Streaks can span seasons.
        Current-season records come from ESPN.
      </SourceNote>
    </>
  );
}
