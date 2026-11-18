import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronRight, Search, UserRound } from 'lucide-react';
import index from '../data/player-records-index.json';
import {
  findRecordPlayers,
  formatPlayerRecord as formatValue,
  indexPlayerNames,
  playerRecordShard,
} from '../lib/player-records.js';
import { seasonLabelFor } from '../lib/season.js';
import { SourceNote } from './LeagueChrome.jsx';
import { EmptyState, ErrorState, LoadingLabel } from './ui.jsx';

const loadShards = import.meta.glob('../data/player-records/*.json', { import: 'default' });
const PLAYERS = indexPlayerNames(index.players);
const SUGGESTED = ['jamesle01', 'jordami01', 'curryst01', 'bryanko01', 'chambwi01', 'doncilu01']
  .map((id) => PLAYERS.find((player) => player.id === id)).filter(Boolean);

const VIEWS = [
  { id: 'game', label: 'Game highs' },
  { id: 'playoffGame', label: 'Playoff game highs' },
  { id: 'season', label: 'Season highs' },
  { id: 'playoffRun', label: 'Playoff run highs' },
  { id: 'career', label: 'Career totals' },
];

const DATE_FORMAT = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

const METRICS = index.metrics.map((metric, position) => ({ ...metric, position }));
const CAREER_METRICS = METRICS.filter(({ scopes }) => !scopes);

function dateLabel(date) {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

function seasonSpan({ first, last }) {
  return first === last ? seasonLabelFor(first) : `${seasonLabelFor(first)} to ${seasonLabelFor(last)}`;
}

function PlayerDirectory({ selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);
  const { players, total } = useMemo(() => findRecordPlayers(PLAYERS, query), [query]);
  const hasQuery = Boolean(query.trim());
  const list = hasQuery ? players : SUGGESTED;
  const select = (player) => {
    onSelect(player);
    setExpanded(false);
  };

  return (
    <aside className="personal-directory" aria-label="Player directory">
      <form onSubmit={(event) => {
        event.preventDefault();
        if (list[0]) select(list[0]);
      }}>
        <label className="stats-search personal-player-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search NBA players"
            type="search"
            placeholder="Search NBA players"
            value={query}
            onFocus={() => setExpanded(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setExpanded(true);
            }}
          />
        </label>
      </form>
      <div className={`personal-match-panel${expanded ? '' : ' personal-match-panel--collapsed'}`}>
        <p className="personal-match-label" role="status">
          {hasQuery
            ? (total > list.length ? `${list.length} of ${formatValue(total)} matches` : `${total} ${total === 1 ? 'match' : 'matches'}`)
            : 'Suggested players'}
        </p>
        {list.length ? (
          <ul className="personal-player-list">
            {list.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  aria-pressed={player.id === selected?.id}
                  onClick={() => select(player)}
                >
                  <span><strong>{player.name}</strong><small>{seasonSpan(player)}</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

function RecordTabs({ view, onView, id }) {
  const moveFocus = (event, position) => {
    const last = VIEWS.length - 1;
    const destination = {
      ArrowLeft: position === 0 ? last : position - 1,
      ArrowRight: position === last ? 0 : position + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    const next = VIEWS[destination].id;
    onView(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };

  return (
    <div className="personal-tabs" role="tablist" aria-label="Personal record views">
      {VIEWS.map(({ id: key, label }, position) => (
        <button
          key={key}
          id={`${id}-${key}`}
          type="button"
          role="tab"
          aria-controls={`${id}-panel`}
          aria-selected={key === view}
          tabIndex={key === view ? 0 : -1}
          onClick={() => onView(key)}
          onKeyDown={(event) => moveFocus(event, position)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function recordContext(context, sample, isGame) {
  const [when, team, opponentOrGames] = context;
  const detail = isGame
    ? [dateLabel(when), [team, opponentOrGames].filter(Boolean).join(' vs. ')]
    : [when, team, `${opponentOrGames} ${opponentOrGames === 1 ? 'game' : 'games'}`];
  if (sample.length) detail.push(`${sample[0]}/${sample[1]} shooting`);
  return detail.filter(Boolean).join(' · ');
}

function RecordHighs({ profile, view }) {
  const [contexts, values] = profile[view];
  const isGame = view === 'game' || view === 'playoffGame';
  const minimum = view === 'season' ? [100, 50] : [10, 5];
  if (!contexts.length) {
    return <EmptyState compact icon={UserRound} title="No recorded appearances in this view" />;
  }

  return (
    <>
      <div className="personal-table-wrap" role="region" tabIndex={0} aria-label="Personal records">
        <table className="personal-table">
          <thead>
            <tr><th scope="col">Stat</th><th scope="col">High</th><th scope="col">{isGame ? 'Game' : 'Season'}</th></tr>
          </thead>
          <tbody>
            {METRICS.filter(({ scopes }) => !scopes || scopes.includes(view)).map(({ id, label, format, position }) => {
              const record = values[position];
              const context = record ? recordContext(contexts[record[1]], record.slice(2), isGame) : '—';
              return (
                <tr key={id} data-stat={id}>
                  <th scope="row">{label}</th>
                  <td className="personal-value">{formatValue(record?.[0], format)}</td>
                  <td className="personal-context">{context}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="personal-qualifications">
        Shooting highs require {minimum[0]} field goal attempts for FG% and eFG%, {minimum[1]} three-point or
        free throw attempts for 3P% or FT%, and {minimum[0]} weighted shooting attempts for TS%.
        {view === 'season' ? ' PER and BPM require 200 minutes in a completed season.' : ''} A dash means no qualifying
        record is available.
      </p>
    </>
  );
}

function CareerTotals({ career }) {
  const [[regularGames, regular, regularPartial], [playoffGames, playoffs, playoffPartial]] = career;
  const value = (stats, partial, position, format) => (
    <>
      {formatValue(stats[position], format)}
      {partial.includes(position) ? <sup aria-label="partial coverage">*</sup> : null}
    </>
  );

  return (
    <>
      <div className="personal-table-wrap" role="region" tabIndex={0} aria-label="Career totals">
        <table className="personal-table personal-table--career">
          <thead><tr><th scope="col">Stat</th><th scope="col">Regular season</th><th scope="col">Playoffs</th></tr></thead>
          <tbody>
            <tr><th scope="row">Games played</th><td>{formatValue(regularGames)}</td><td>{formatValue(playoffGames)}</td></tr>
            {CAREER_METRICS.map(({ id, label, format, position }) => (
              <tr key={id} data-stat={id}>
                <th scope="row">{label}</th>
                <td className="personal-value">{value(regular, regularPartial, position, format)}</td>
                <td className="personal-value">{value(playoffs, playoffPartial, position, format)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="personal-qualifications">
        Shooting rates use combined makes and attempts. An asterisk marks a stat recorded for only part of the player’s career.
      </p>
    </>
  );
}

function PersonalProfile({ player }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState('game');
  const tabId = useId();

  useEffect(() => {
    let active = true;
    const load = loadShards[`../data/player-records/${playerRecordShard(player.id)}.json`];
    load().then((shard) => {
      if (!active) return;
      if (shard[player.id]) setProfile(shard[player.id]);
      else setError(true);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [player.id]);

  return (
    <section className="personal-profile" aria-label={`${player.name} personal records`}>
      <header className="personal-profile-header">
        <h2>{player.name}</h2>
        <p>{seasonSpan(player)}</p>
      </header>
      {error ? <ErrorState compact title="Could not load this player’s records" description="Select another player or reopen the Record Book." /> : null}
      {!error && !profile ? <LoadingLabel>Loading personal records…</LoadingLabel> : null}
      {profile ? (
        <>
          <RecordTabs view={view} onView={setView} id={tabId} />
          <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${view}`} tabIndex={0}>
            {view === 'career' ? <CareerTotals career={profile.career} /> : <RecordHighs profile={profile} view={view} />}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function PersonalRecords() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="personal-layout">
        <PlayerDirectory selected={selected} onSelect={setSelected} />
        {selected ? <PersonalProfile key={selected.id} player={selected} /> : (
          <EmptyState
            icon={UserRound}
            title="Select a player"
            description="Find personal game highs, season records, playoff records and career totals."
          />
        )}
      </div>
      <SourceNote>
        Available NBA and BAA box scores through {dateLabel(index.through)}. Playoff runs cover completed postseasons
        through {index.completed}. Play-in and NBA Cup final games are excluded.
      </SourceNote>
    </>
  );
}
