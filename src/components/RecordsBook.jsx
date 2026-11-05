import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Crown, RefreshCw, Search, Trophy } from 'lucide-react';
import bundledRecords from '../data/records.json';
import {
  fetchRecords,
  hasRecordsBridge,
  onRecordsSyncError,
  onRecordsUpdated,
  refreshRecords,
} from '../lib/api.js';
import { LeagueHeader, SourceNote } from './LeagueChrome.jsx';
import { EmptyState } from './ui.jsx';

const PLAYER_SCOPES = [
  { id: 'singleGame', label: 'Single game' },
  { id: 'singleSeason', label: 'Single season' },
  { id: 'career', label: 'Career' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'team', label: 'Team' },
];

const PLAYOFF_TYPES = [
  { id: 'singleGame', label: 'Game' },
  { id: 'singleSeason', label: 'Season' },
  { id: 'career', label: 'Career' },
];

const CATEGORY_ORDER = ['PTS', 'TRB', 'AST', 'STL', 'BLK', '3P', 'TOV'];

function prettyDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatUpdated(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function recordDetail(scope, entry) {
  if (scope === 'singleGame') return [prettyDate(entry.date), entry.team].filter(Boolean).join(' · ');
  if (scope === 'singleSeason') return entry.season || '';
  return '';
}

function PodiumCard({ entry, index, scope, categoryLabel }) {
  if (!entry) return null;
  const medal = ['Ⅰ', 'Ⅱ', 'Ⅲ'][index] || '';
  return (
    <article className={`record-podium-card record-podium-card--${index + 1}`}>
      <span className="record-podium-rank">{medal}</span>
      <div className="record-podium-copy">
        <span className="record-podium-category">{categoryLabel}</span>
        <h3>{entry.player}</h3>
        <p>{recordDetail(scope, entry) || 'All-time leaderboard'}</p>
      </div>
      <strong>{entry.value}</strong>
      <Crown size={16} className="record-podium-crown" />
    </article>
  );
}

function PlayerRecords({ records, scope, category, onCategory, search, setSearch }) {
  const [playoffType, setPlayoffType] = useState('career');
  const source = scope === 'playoffs' ? records.playoffs : records.regularSeason;
  const activeScope = scope === 'playoffs' ? playoffType : scope;
  const categoryData = source?.[category] || null;
  const rows = categoryData?.[activeScope] || [];
  const categoryLabel = categoryData?.label || category;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.player} ${row.team || ''} ${row.season || ''} ${row.date || ''}`.toLowerCase().includes(query),
    );
  }, [rows, search]);
  const podium = filtered.slice(0, 3);
  const rest = filtered.slice(3);
  const detailHeading =
    activeScope === 'singleGame'
      ? 'Date · Team'
      : activeScope === 'singleSeason'
        ? 'Season'
        : 'Record book';

  return (
    <>
      <div className="records-controls">
        <div className="records-categories">
          {CATEGORY_ORDER.map((id) => {
            const label = source?.[id]?.label || id;
            return (
              <button
                type="button"
                key={id}
                className={`record-category ${category === id ? 'record-category--active' : ''}`}
                onClick={() => onCategory(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label className="stats-search records-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search the record book"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {scope === 'playoffs' ? (
        <div className="records-playoff-types">
          {PLAYOFF_TYPES.map((type) => (
            <button
              type="button"
              key={type.id}
              className={`record-subtab ${playoffType === type.id ? 'record-subtab--active' : ''}`}
              onClick={() => setPlayoffType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
      ) : null}

      {!filtered.length ? (
        <EmptyState
          icon={Trophy}
          title="No records match that search"
          description="Try a player, team or season."
        />
      ) : (
        <>
          {!search.trim() && podium.length ? (
            <div className="records-podium">
              {podium.map((entry, index) => (
                <PodiumCard
                  key={`${category}-${entry.rank}-${entry.player}`}
                  entry={entry}
                  index={index}
                  scope={activeScope}
                  categoryLabel={categoryLabel}
                />
              ))}
            </div>
          ) : null}
          <div className="records-table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>{categoryLabel}</th>
                  <th>{detailHeading}</th>
                </tr>
              </thead>
              <tbody>
                {(search.trim() ? filtered : rest.length ? rest : filtered).map((entry) => (
                  <tr key={`${category}-${entry.rank}-${entry.player}-${entry.date || entry.season || ''}`}>
                    <td className="records-rank">{String(entry.rank).padStart(2, '0')}</td>
                    <td>
                      <strong>{entry.player}</strong>
                    </td>
                    <td className="records-value">{entry.value}</td>
                    <td className="records-detail">
                      {recordDetail(activeScope, entry) || <span className="records-muted">All-time</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function TeamRecords({ records, search, setSearch }) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records.team || [];
    return (records.team || []).filter((entry) =>
      `${entry.category} ${entry.holder} ${entry.detail}`.toLowerCase().includes(query),
    );
  }, [records.team, search]);

  return (
    <>
      <div className="records-controls">
        <div>
          <p className="league-kicker">Franchise marks</p>
          <h2 className="records-subtitle">The team record book</h2>
        </div>
        <label className="stats-search records-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search team records"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="team-records-grid">
        {filtered.map((entry) => (
          <article className="team-record-card" key={`${entry.category}-${entry.holder}`}>
            <span className="team-record-rank">{String(entry.rank).padStart(2, '0')}</span>
            <p className="league-kicker">{entry.category}</p>
            <strong>{entry.value}</strong>
            <h3>{entry.holder}</h3>
            <p>{entry.detail}</p>
            <ArrowUpRight size={15} />
          </article>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState icon={Trophy} title="No team records match" description="Try another team or category." />
      ) : null}
    </>
  );
}

export default function RecordsBook() {
  const [scope, setScope] = useState('singleGame');
  const [category, setCategory] = useState('PTS');
  const [search, setSearch] = useState('');
  const [book, setBook] = useState(bundledRecords);
  const [sync, setSync] = useState({
    checking: false,
    busy: false,
    error: null,
    lastUpdated: null,
  });

  const canSync = useMemo(() => hasRecordsBridge(), []);

  const applyResult = (result) => {
    if (!result?.data) return;
    setBook(result.data);
    setSync((previous) => ({
      ...previous,
      checking: Boolean(result.meta?.refreshing),
      lastUpdated: result.meta?.fetchedAt || result.data.generatedAt || previous.lastUpdated,
      error: result.meta?.warning || null,
    }));
  };

  useEffect(() => {
    if (!canSync) return undefined;
    let active = true;

    const stopUpdates = onRecordsUpdated((result) => {
      if (!active) return;
      applyResult(result);
      setSync((previous) => ({ ...previous, busy: false }));
    });
    const stopErrors = onRecordsSyncError((message) => {
      if (!active) return;
      setSync((previous) => ({ ...previous, busy: false, checking: false, error: message }));
    });

    fetchRecords()
      .then((result) => {
        if (active) applyResult(result);
      })
      .catch((error) => {
        if (active) setSync((previous) => ({ ...previous, error: error.message }));
      });

    return () => {
      active = false;
      stopUpdates();
      stopErrors();
    };
  }, [canSync]);

  const handleScope = (next) => {
    setScope(next);
    setSearch('');
  };

  const handleCategory = (next) => {
    setCategory(next);
    setSearch('');
  };

  const handleSync = async () => {
    if (!canSync) return;
    setSync((previous) => ({ ...previous, busy: true, error: null }));
    try {
      const result = await refreshRecords();
      applyResult(result);
      setSync((previous) => ({ ...previous, busy: false, checking: false }));
    } catch (error) {
      setSync((previous) => ({
        ...previous,
        busy: false,
        checking: false,
        error: error.message || 'Records sync failed.',
      }));
    }
  };

  const isLive = book.mode === 'live';
  const updated = formatUpdated(sync.lastUpdated || book.generatedAt);
  const archiveThrough = book.updatedThrough || book.snapshot || '2023-24';
  const freshness = isLive
    ? `Auto-synced${updated ? ` ${updated}` : ''}`
    : `Bundled archive · regular season through ${archiveThrough}`;
  const description = isLive
    ? 'Single-game explosions, season-long peaks, playoff legend and career mounts. Rebuilt from Basketball Reference all-time leaderboards whenever FullCourt checks for fresh data. Team records are curated.'
    : `Single-game explosions, season-long peaks, playoff legend and career mounts. Regular-season lists are current through ${archiveThrough}; FullCourt checks for a fresher leaderboard snapshot on every launch.`;

  return (
    <div className="league-page records-page">
      <LeagueHeader
        eyebrow="NBA · THE RECORD BOOK"
        title="History, in order"
        description={description}
        actions={
          <div className="records-header-actions">
            {canSync ? (
              <button
                type="button"
                className="records-sync-button"
                onClick={handleSync}
                disabled={sync.busy || sync.checking}
              >
                <RefreshCw size={15} className={sync.busy || sync.checking ? 'spin' : ''} />
                {sync.busy ? 'Syncing' : sync.checking ? 'Checking' : 'Refresh data'}
              </button>
            ) : null}
            <div className={`records-header-mark ${isLive ? 'records-header-mark--live' : ''}`}>
              <Trophy size={22} />
              <span>{isLive ? 'Auto-synced' : 'Archive'}</span>
            </div>
          </div>
        }
      />

      <div className="records-scope-row">
        <div className="records-scopes" role="tablist" aria-label="Record scope">
          {PLAYER_SCOPES.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={scope === item.id}
              key={item.id}
              className={`records-scope ${scope === item.id ? 'records-scope--active' : ''}`}
              onClick={() => handleScope(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="records-snapshot" aria-live="polite">
          {freshness} · {book.source || 'Basketball Reference via Kaggle'}
        </span>
      </div>

      {sync.checking && !sync.busy ? (
        <p className="records-sync-message">Checking Basketball Reference for fresh leaderboards…</p>
      ) : null}
      {sync.error ? (
        <p className="records-sync-message records-sync-message--error" role="status">
          Fresh data unavailable: {sync.error}
        </p>
      ) : null}

      {scope === 'team' ? (
        <TeamRecords records={book} search={search} setSearch={setSearch} />
      ) : (
        <PlayerRecords
          records={book}
          scope={scope}
          category={category}
          onCategory={handleCategory}
          search={search}
          setSearch={setSearch}
        />
      )}

      <SourceNote>
        {isLive
          ? `All-time leaderboards are refreshed from Basketball Reference. Team records are curated. Records are facts, not projections. Values are regular-season unless the Playoffs tab is selected.`
          : `Regular-season season and career lists were rebuilt from Basketball Reference historical data through ${archiveThrough}; playoff lists remain the archived 2023-24 snapshot, and single-game scoring includes March 2026. FullCourt retries the full live leaderboard sync on future launches when Basketball Reference is available. Team records are curated. Values are regular-season unless the Playoffs tab is selected.`}
      </SourceNote>
    </div>
  );
}
