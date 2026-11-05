import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Plus, Search, Trash2 } from 'lucide-react';
import { usePlayerStats } from '../hooks/useLeagueData.js';
import {
  ERA_METHOD,
  ERA_REFERENCE,
  LEGEND_PRESETS,
  playerEraProfile,
} from '../lib/era.js';
import { currentSeasonYear, seasonOptions } from '../lib/season.js';
import {
  formatDecimal,
  formatPercent,
  formatSigned,
} from '../lib/format.js';
import { LeagueHeader, SeasonSelect, SourceNote } from './LeagueChrome.jsx';
import {
  ErrorState,
  LoadingLabel,
  Skeleton,
  TeamLogo,
} from './ui.jsx';

const SEASONS = seasonOptions(1950, currentSeasonYear());

const DEFAULT_SLOTS = [
  { id: 'mj-1996', seasonYear: 1996, targetName: 'Michael Jordan', playerId: null },
  { id: 'lebron-2013', seasonYear: 2013, targetName: 'LeBron James', playerId: null },
];

function num(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value, digits = 1) {
  return value == null ? '—' : formatDecimal(value, digits);
}

function fmtPct(value, digits = 1) {
  return value == null ? '—' : formatPercent(value, digits);
}

function monogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function SlotStat({ label, value, detail }) {
  return (
    <div className="era-slot-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function EraSlot({ slot, index, canRemove, onUpdate, onRemove, onResult }) {
  const { data, meta, loading, refreshing, error, refresh } = usePlayerStats(slot.seasonYear);
  const [query, setQuery] = useState(slot.targetName || '');
  const players = data?.players || [];

  const selected = useMemo(() => {
    if (!players.length) return null;
    if (slot.playerId) return players.find((player) => player.id === slot.playerId) || null;
    if (slot.targetName) {
      const target = slot.targetName.toLowerCase();
      return (
        players.find((player) => player.name.toLowerCase() === target) ||
        players.find((player) => player.name.toLowerCase().includes(target)) ||
        null
      );
    }
    return null;
  }, [players, slot.playerId, slot.targetName]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = players.filter((player) => player.games >= 5);
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((player) => `${player.name} ${player.team}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [players, query]);

  useEffect(() => {
    if (!data || !selected || slot.playerId) return;
    onUpdate(slot.id, {
      playerId: selected.id,
      playerName: selected.name,
      targetName: null,
    });
  }, [data, selected, slot.id, slot.playerId, onUpdate]);

  useEffect(() => {
    if (!selected || !data) {
      onResult(slot.id, null);
      return;
    }
    onResult(slot.id, {
      player: selected,
      era: data.era,
      seasonLabel: data.seasonLabel,
    });
  }, [data, selected, slot.id, onResult]);

  const handleSeason = (nextSeason) => {
    onUpdate(slot.id, {
      seasonYear: nextSeason,
      playerId: null,
      playerName: null,
      targetName: null,
    });
    setQuery('');
  };

  const choosePlayer = (player) => {
    onUpdate(slot.id, {
      playerId: player.id,
      playerName: player.name,
      targetName: null,
    });
    setQuery(player.name);
  };

  const changePlayer = () => {
    onUpdate(slot.id, { playerId: null, playerName: null, targetName: null });
    setQuery('');
  };

  const profile = selected && data ? playerEraProfile(selected, data.era) : null;

  return (
    <article className={`era-slot ${profile ? 'era-slot--filled' : ''}`}>
      <div className="era-slot-toolbar">
        <span className="era-slot-index">Era {String(index + 1).padStart(2, '0')}</span>
        <SeasonSelect
          value={slot.seasonYear}
          onChange={handleSeason}
          options={SEASONS}
          label="Season"
        />
        <button
          type="button"
          className="era-remove"
          onClick={() => onRemove(slot.id)}
          disabled={!canRemove}
          aria-label={`Remove era ${index + 1}`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {loading && !data ? (
        <div className="era-slot-loading">
          <Skeleton className="era-loading-name" />
          <Skeleton className="era-loading-line" />
          <Skeleton className="era-loading-grid" />
          <LoadingLabel>Loading {slot.seasonYear - 1}-{String(slot.seasonYear).slice(-2)}…</LoadingLabel>
        </div>
      ) : null}

      {error && !data ? (
        <ErrorState
          compact
          title={`${slot.seasonYear - 1}-${String(slot.seasonYear).slice(-2)} unavailable`}
          error={error}
          onRetry={refresh}
        />
      ) : null}

      {data && !selected ? (
        <div className="era-player-picker">
          <div className="era-picker-heading">
            <span className="league-kicker">Choose a player</span>
            {meta?.stale ? <span className="era-stale">cached</span> : null}
          </div>
          <label className="era-search">
            <Search size={14} />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={`Search ${data.players.length} players`}
              autoFocus={index === 0}
            />
          </label>
          <div className="era-suggestions">
            {suggestions.map((player) => (
              <button
                type="button"
                key={player.id}
                className="era-suggestion"
                onClick={() => choosePlayer(player)}
              >
                <span className="era-suggestion-avatar">{monogram(player.name)}</span>
                <span className="era-suggestion-copy">
                  <strong>{player.name}</strong>
                  <em>{player.team} · {player.position || '—'} · {player.games} GP</em>
                </span>
                <span className="era-suggestion-ppg">{fmt(player.stats.pts)} <small>PPG</small></span>
              </button>
            ))}
            {!suggestions.length ? <p className="era-no-results">No players match that name.</p> : null}
          </div>
          <p className="era-picker-note">
            {meta?.stale ? 'Cached Basketball Reference data. ' : 'Basketball Reference · '}
            Choose any qualifying player-season to compare.
          </p>
        </div>
      ) : null}

      {data && selected ? (
        <>
          <div className="era-player-head">
            <div className="era-player-mark">{monogram(selected.name)}</div>
            <div className="era-player-identity">
              <span className="league-kicker">{data.seasonLabel} · {selected.team}</span>
              <h2>{selected.name}</h2>
              <p>
                {selected.position || '—'} · {selected.games} GP · {fmt(selected.mpg)} MPG
                {selected.gamesStarted ? ` · ${selected.gamesStarted} GS` : ''}
              </p>
            </div>
            <TeamLogo
              team={{ abbreviation: selected.team, logo: selected.teamLogo, color: null }}
              size={42}
            />
            <button type="button" className="era-change" onClick={changePlayer}>
              Change
            </button>
          </div>

          {refreshing ? <p className="era-refreshing">Refreshing season…</p> : null}

          <div className="era-context">
            <span><em>League pace</em>{fmt(data.era?.pace)}</span>
            <span><em>League ORtg</em>{fmt(data.era?.ortg)}</span>
            <span><em>League TS%</em>{fmtPct(data.era?.tsPct)}</span>
            <span><em>3PAr</em>{fmtPct(data.era?.threePtAr)}</span>
            {profile?.usingEstimate ? <span className="era-estimate">estimated per-100</span> : null}
          </div>

          <section className="era-slot-section">
            <div className="era-slot-section-head">
              <h3>Per game</h3>
              <span>Volume</span>
            </div>
            <div className="era-slot-stats">
              <SlotStat label="PPG" value={fmt(selected.stats.pts)} />
              <SlotStat label="RPG" value={fmt(selected.stats.reb)} />
              <SlotStat label="APG" value={fmt(selected.stats.ast)} />
              <SlotStat label="SPG" value={fmt(selected.stats.stl)} />
              <SlotStat label="BPG" value={fmt(selected.stats.blk)} />
              <SlotStat label="TOV" value={fmt(selected.stats.tov)} />
            </div>
          </section>

          <section className="era-slot-section">
            <div className="era-slot-section-head">
              <h3>Per 100 possessions</h3>
              <span>{profile?.usingEstimate ? 'pace estimate' : 'pace neutral'}</span>
            </div>
            <div className="era-slot-stats era-slot-stats--compact">
              <SlotStat label="PTS" value={fmt(profile?.per100.pts)} />
              <SlotStat label="REB" value={fmt(profile?.per100.reb)} />
              <SlotStat label="AST" value={fmt(profile?.per100.ast)} />
              <SlotStat label="STL" value={fmt(profile?.per100.stl)} />
              <SlotStat label="BLK" value={fmt(profile?.per100.blk)} />
              <SlotStat label="3PM" value={fmt(profile?.per100.tpm)} />
            </div>
          </section>

          <section className="era-slot-section era-slot-section--accent">
            <div className="era-slot-section-head">
              <h3>Era adjusted</h3>
              <span>{ERA_REFERENCE.ortg.toFixed(0)} ORtg baseline</span>
            </div>
            <div className="era-slot-stats era-slot-stats--compact">
              <SlotStat label="ADJ PTS/100" value={fmt(profile?.adjusted.ptsPer100)} detail="scoring" />
              <SlotStat label="TS+" value={fmt(profile?.adjusted.tsPlus)} detail="100 = avg" />
              <SlotStat label="3PAr+" value={fmt(profile?.adjusted.threeParPlus)} detail="100 = avg" />
              <SlotStat label="FTr+" value={fmt(profile?.adjusted.ftrPlus)} detail="100 = avg" />
              <SlotStat label="SCORING" value={fmt(profile?.adjusted.scoringIndex)} detail="adj × TS+" />
              <SlotStat label="USG%" value={fmtPct(profile?.per100.usgPct)} />
            </div>
          </section>

          <div className="era-advanced-line">
            <span><em>PER</em>{fmt(selected.advanced?.per)}</span>
            <span><em>BPM</em>{formatSigned(selected.advanced?.bpm)}</span>
            <span><em>WS/48</em>{fmt(selected.advanced?.ws48, 3)}</span>
            <span><em>VORP</em>{fmt(selected.advanced?.vorp)}</span>
          </div>
        </>
      ) : null}
    </article>
  );
}

function ComparisonTable({ entries }) {
  const rows = [
    {
      group: 'Per game',
      items: [
        { label: 'PPG', get: (entry) => entry.player.stats.pts },
        { label: 'RPG', get: (entry) => entry.player.stats.reb },
        { label: 'APG', get: (entry) => entry.player.stats.ast },
        { label: 'SPG', get: (entry) => entry.player.stats.stl },
        { label: 'BPG', get: (entry) => entry.player.stats.blk },
        { label: 'TOV', get: (entry) => entry.player.stats.tov, lower: true },
      ],
    },
    {
      group: 'Per 100 possessions',
      items: [
        { label: 'PTS', get: (entry) => entry.profile.per100.pts },
        { label: 'REB', get: (entry) => entry.profile.per100.reb },
        { label: 'AST', get: (entry) => entry.profile.per100.ast },
        { label: 'STL', get: (entry) => entry.profile.per100.stl },
        { label: 'BLK', get: (entry) => entry.profile.per100.blk },
        { label: '3PM', get: (entry) => entry.profile.per100.tpm },
      ],
    },
    {
      group: 'Era adjusted',
      items: [
        { label: 'Adj PTS/100', get: (entry) => entry.profile.adjusted.ptsPer100, accent: true },
        { label: 'TS+', get: (entry) => entry.profile.adjusted.tsPlus, accent: true },
        { label: '3PAr+', get: (entry) => entry.profile.adjusted.threeParPlus },
        { label: 'FTr+', get: (entry) => entry.profile.adjusted.ftrPlus },
        { label: 'Scoring index', get: (entry) => entry.profile.adjusted.scoringIndex, accent: true },
      ],
    },
    {
      group: 'Advanced',
      items: [
        { label: 'PER', get: (entry) => entry.player.advanced?.per },
        { label: 'TS%', get: (entry) => entry.player.advanced?.tsPct, percent: true },
        { label: 'USG%', get: (entry) => entry.player.advanced?.usgPct, percent: true },
        { label: 'BPM', get: (entry) => entry.player.advanced?.bpm, signed: true },
        { label: 'WS/48', get: (entry) => entry.player.advanced?.ws48, digits: 3 },
      ],
    },
  ];

  return (
    <section className="era-comparison">
      <div className="era-comparison-head">
        <div>
          <p className="league-kicker">Side by side</p>
          <h2>The adjusted comparison</h2>
        </div>
        <p>{ERA_REFERENCE.label} · best mark in each row is highlighted</p>
      </div>
      <div className="era-table-wrap">
        <table className="era-table">
          <thead>
            <tr>
              <th>Metric</th>
              {entries.map((entry) => (
                <th key={entry.slot.id}>
                  <strong>{entry.player.name}</strong>
                  <span>{entry.seasonLabel} · {entry.player.team}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FragmentRows key={row.group} row={row} entries={entries} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="era-table-foot">
        Pace-neutral rates use BBR per-possession tables when available; older seasons are estimated
        from per-game production, league pace and minutes. Adjusted scoring normalizes to a 115.0
        league ORtg. Hover a value for its raw basis.
      </p>
    </section>
  );
}

function FragmentRows({ row, entries }) {
  return (
    <>
      <tr className="era-table-group">
        <td colSpan={entries.length + 1}>{row.group}</td>
      </tr>
      {row.items.map((metric) => {
        const values = entries.map((entry) => num(metric.get(entry)));
        const present = values.filter((value) => value !== null);
        const max = present.length ? Math.max(...present) : null;
        const min = present.length ? Math.min(...present) : null;
        const bestValue = metric.lower ? min : max;
        const showBest = present.length > 1 && Math.min(...present) !== Math.max(...present);
        return (
          <tr key={`${row.group}-${metric.label}`} className={metric.accent ? 'era-table-accent' : ''}>
            <th scope="row">{metric.label}</th>
            {entries.map((entry, index) => {
              const value = values[index];
              const best = showBest && value === bestValue;
              return (
                <td
                  key={entry.slot.id}
                  className={best ? 'is-best' : ''}
                  title={`${entry.player.name} · ${metric.label}: ${value ?? 'not available'}`}
                >
                  {value == null
                    ? '—'
                    : metric.percent
                      ? fmtPct(value)
                      : metric.signed
                        ? formatSigned(value)
                        : fmt(value, metric.digits ?? 1)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

export default function EraLab() {
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [results, setResults] = useState({});
  const nextId = useRef(3);

  const handleUpdate = useCallback((id, patch) => {
    setSlots((previous) => previous.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
    if ('seasonYear' in patch || 'playerId' in patch) {
      setResults((previous) => {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }
  }, []);

  const handleResult = useCallback((id, result) => {
    setResults((previous) => {
      if (!result) {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      }
      return { ...previous, [id]: result };
    });
  }, []);

  const addSlot = () => {
    if (slots.length >= 4) return;
    setSlots((previous) => [
      ...previous,
      {
        id: `era-${nextId.current++}`,
        seasonYear: currentSeasonYear(),
        playerId: null,
        targetName: null,
      },
    ]);
  };

  const removeSlot = (id) => {
    setSlots((previous) => previous.filter((slot) => slot.id !== id));
    setResults((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const addPreset = (preset) => {
    if (slots.length >= 4) return;
    if (slots.some((slot) => slot.seasonYear === preset.season && (slot.playerName === preset.name || slot.targetName === preset.name))) return;
    setSlots((previous) => [
      ...previous,
      {
        id: `preset-${preset.season}-${preset.name.replace(/\s+/g, '-').toLowerCase()}`,
        seasonYear: preset.season,
        playerId: null,
        targetName: preset.name,
      },
    ]);
  };

  const resetLab = () => {
    setSlots(DEFAULT_SLOTS);
    setResults({});
  };

  const entries = useMemo(
    () =>
      slots
        .map((slot) => {
          const result = results[slot.id];
          if (!result) return null;
          return {
            slot,
            ...result,
            profile: playerEraProfile(result.player, result.era),
          };
        })
        .filter(Boolean),
    [results, slots],
  );

  return (
    <div className="league-page era-page">
      <LeagueHeader
        eyebrow="NBA · ERA LAB"
        title="Different eras, one lens"
        description="Put any two to four player-seasons side by side. See raw production, pace-neutral rates and a transparent era adjustment built from league context — not a claim about who would win."
        actions={
          <>
            <button type="button" className="era-reset" onClick={resetLab}>
              Reset lab
            </button>
            <button type="button" className="era-add" onClick={addSlot} disabled={slots.length >= 4}>
              <Plus size={15} /> Add era
            </button>
          </>
        }
      />

      <div className="era-quickstarts">
        <span className="league-kicker">Quick starts</span>
        <div className="era-quickstart-row">
          {LEGEND_PRESETS.map((preset) => {
            const active = slots.some(
              (slot) => slot.seasonYear === preset.season && (slot.targetName === preset.name || slot.playerName === preset.name),
            );
            return (
              <button
                type="button"
                key={preset.label}
                className={`era-quickstart ${active ? 'era-quickstart--active' : ''}`}
                onClick={() => addPreset(preset)}
                disabled={active || slots.length >= 4}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {slots.length ? (
        <div className={`era-slots ${slots.length > 2 ? 'era-slots--dense' : ''}`}>
          {slots.map((slot, index) => (
            <EraSlot
              key={slot.id}
              slot={slot}
              index={index}
              canRemove={slots.length > 1}
              onUpdate={handleUpdate}
              onRemove={removeSlot}
              onResult={handleResult}
            />
          ))}
        </div>
      ) : (
        <div className="era-empty">
          <FlaskConical size={26} />
          <h2>Start a comparison</h2>
          <p>Pick any two player-seasons. Use a quick start or add an empty era card.</p>
          <button type="button" className="era-add" onClick={addSlot}>
            <Plus size={15} /> Add era
          </button>
        </div>
      )}

      {entries.length >= 2 ? <ComparisonTable entries={entries} /> : null}

      <details className="era-method" open>
        <summary>How the era adjustment works</summary>
        <div>
          {ERA_METHOD.map((line) => <p key={line}>{line}</p>)}
        </div>
      </details>

      <SourceNote>
        Player seasons and league context via Basketball Reference. Era weights are an explanatory
        lens, not an official NBA metric. Seasonal stats are cached for one hour; historical seasons
        remain static.
      </SourceNote>
    </div>
  );
}
