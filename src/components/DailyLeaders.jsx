import { useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, Flame, Radio, RotateCw, Trophy } from 'lucide-react';
import { useDailyLeaders } from '../hooks/useLeagueData.js';
import {
  addDaysToKey,
  formatLongDate,
  formatTimeAgo,
  formatUpdatedTime,
  nbaTodayKey,
} from '../lib/format.js';
import { DatePager, LeagueHeader, SourceNote } from './LeagueChrome.jsx';
import { ErrorState, LoadingLabel, PlayerAvatar, Skeleton } from './ui.jsx';

const SUMMARY_CATEGORIES = [
  { id: 'pts', label: 'Points' },
  { id: 'reb', label: 'Rebounds' },
  { id: 'ast', label: 'Assists' },
  { id: 'fantasy', label: 'Fantasy' },
];

function leaderValue(category, leader) {
  if (!leader) return '—';
  if (category === 'fantasy') return leader.display;
  return leader.display;
}

function SummaryCard({ category, leader, onOpenGame }) {
  if (!leader) {
    return <div className="daily-summary-card daily-summary-card--empty">Awaiting games</div>;
  }
  return (
    <button
      type="button"
      className="daily-summary-card"
      onClick={() => onOpenGame?.(leader.gameId)}
      title={`Open ${leader.teamAbbreviation} vs ${leader.opponentAbbreviation}`}
    >
      <span className="daily-summary-label">
        <Flame size={13} /> {category.label}
      </span>
      <span className="daily-summary-value">
        {leaderValue(category.id, leader)}
        <em>{category.id === 'fantasy' ? 'FPTS' : category.id.toUpperCase()}</em>
      </span>
      <span className="daily-summary-player">
        <PlayerAvatar player={{ headshot: leader.headshot, name: leader.name }} size={30} />
        <span>
          <strong>{leader.name}</strong>
          <small>{leader.teamAbbreviation} · {leader.gameStatus}</small>
        </span>
      </span>
      <ArrowUpRight size={15} className="daily-summary-arrow" />
    </button>
  );
}

function LeaderRow({ entry, category, onOpenGame }) {
  const [imageFailed, setImageFailed] = useState(false);
  const line = entry.statLine || {};
  const detail =
    category === 'fgPct'
      ? `${line.fgm}-${line.fga} FG`
      : `${line.pts} PTS · ${line.reb} REB · ${line.ast} AST`;
  return (
    <button
      type="button"
      className="daily-leader-row"
      onClick={() => onOpenGame?.(entry.gameId)}
      title={`Open ${entry.teamAbbreviation} vs ${entry.opponentAbbreviation}`}
    >
      <span className="daily-rank">{String(entry.rank).padStart(2, '0')}</span>
      <span className="daily-player-face">
        {!imageFailed && entry.headshot ? (
          <img
            src={entry.headshot}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <PlayerAvatar player={entry} size={34} />
        )}
      </span>
      <span className="daily-player-copy">
        <strong>{entry.name}</strong>
        <small>{entry.teamName} · vs {entry.opponentAbbreviation}</small>
      </span>
      <span className="daily-line-detail">{detail}</span>
      <span className="daily-game-state">
        <span className={entry.gameState === 'in' ? 'is-live' : ''}>{entry.gameStatus}</span>
      </span>
      <strong className="daily-value">{leaderValue(category.id, entry)}</strong>
    </button>
  );
}

export default function DailyLeaders({ dateKey, onDateChange, onOpenGame }) {
  const { data, meta, loading, refreshing, error, refresh } = useDailyLeaders(dateKey);
  const [category, setCategory] = useState('pts');
  const today = nbaTodayKey();
  const isToday = dateKey === today;
  const categories = data?.categories || [];
  const leaders = data?.leaders?.[category] || [];
  const topFantasy = data?.leaders?.fantasy || [];
  const activeCategory = categories.find((entry) => entry.id === category);
  const summary = useMemo(
    () =>
      SUMMARY_CATEGORIES.map((entry) => ({
        category: entry,
        leader: data?.leaders?.[entry.id]?.[0] || null,
      })),
    [data],
  );

  const go = (delta) => onDateChange(addDaysToKey(dateKey, delta));

  return (
    <div className="league-page daily-page">
      <LeagueHeader
        eyebrow="NBA · LIVE DAILY LEADERS"
        title={isToday ? 'Tonight, as it happens' : formatLongDate(dateKey)}
        description="Every category is built from today's live box scores. Percentages require at least four field-goal attempts."
        actions={
          <div className="league-header-action-stack">
            <DatePager
              dateKey={dateKey}
              label={formatLongDate(dateKey)}
              isToday={isToday}
              onPrevious={() => go(-1)}
              onNext={() => go(1)}
              onToday={() => onDateChange(today)}
            />
            <button
              type="button"
              className="league-refresh-button"
              onClick={refresh}
              disabled={loading || refreshing}
            >
              <RotateCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        }
      />

      <div className="daily-feed-strip">
        <span className={`daily-feed-pill ${data?.liveGames ? 'is-live' : ''}`}>
          {loading && !data ? (
            <Clock3 size={13} />
          ) : data?.liveGames ? (
            <Radio size={13} />
          ) : (
            <Trophy size={13} />
          )}
          {loading && !data
            ? 'BUILDING BOARD'
            : data?.liveGames
              ? `${data.liveGames} LIVE`
              : 'FINAL BOARD'}
        </span>
        <span>
          {loading && !data
            ? 'Fetching live box scores…'
            : `${data?.gamesCount || 0} games · ${data?.playersCount || 0} players`}
        </span>
        {meta?.fetchedAt ? (
          <span className="daily-updated">
            <Clock3 size={13} /> Updated {formatUpdatedTime(meta.fetchedAt)} · {formatTimeAgo(meta.fetchedAt)}
          </span>
        ) : null}
      </div>

      {error && !data ? (
        <ErrorState
          title="Daily leaders unavailable"
          description="The NBA feed did not return a box score board for this date."
          error={error}
          onRetry={refresh}
        />
      ) : null}

      {loading && !data ? (
        <div className="daily-loading">
          <div className="daily-summary-grid">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="daily-summary-skeleton" />)}
          </div>
          <Skeleton className="daily-board-skeleton" />
          <LoadingLabel>Building the nightly board…</LoadingLabel>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="daily-summary-grid">
            {summary.map(({ category: item, leader }) => (
              <SummaryCard key={item.id} category={item} leader={leader} onOpenGame={onOpenGame} />
            ))}
          </div>

          <div className="daily-layout">
            <section className="daily-board" aria-label={`${activeCategory?.label || 'Stat'} leaders`}>
              <div className="daily-board-head">
                <div>
                  <p className="league-kicker">Category leaders</p>
                  <h2>{activeCategory?.label || 'Points'} tonight</h2>
                </div>
                <span className="daily-board-count">{leaders.length} leaders</span>
              </div>

              <div className="daily-category-strip" role="tablist" aria-label="Leader categories">
                {categories.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={category === item.id}
                    key={item.id}
                    className={`daily-category ${category === item.id ? 'daily-category--active' : ''}`}
                    onClick={() => setCategory(item.id)}
                  >
                    <span>{item.label}</span>
                    <em>{item.abbreviation}</em>
                  </button>
                ))}
              </div>

              {leaders.length ? (
                <div className="daily-leader-list">
                  {leaders.map((entry) => (
                    <LeaderRow
                      key={`${category}-${entry.id}-${entry.gameId}`}
                      entry={entry}
                      category={category}
                      onOpenGame={onOpenGame}
                    />
                  ))}
                </div>
              ) : (
                <div className="daily-no-leaders">
                  No qualifying {activeCategory?.label?.toLowerCase()} lines yet. Check back after tip-off.
                </div>
              )}

              <SourceNote>
                Live leaderboards are computed in-app from ESPN box scores. Fantasy scoring:
                PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK + 0.5 3PM − TOV.
              </SourceNote>
            </section>

            <aside className="daily-rail">
              <section className="daily-rail-card">
                <div className="daily-rail-head">
                  <div>
                    <p className="league-kicker">Top performers</p>
                    <h2>Fantasy pulse</h2>
                  </div>
                  <Flame size={18} />
                </div>
                {topFantasy.slice(0, 6).map((entry) => (
                  <button
                    type="button"
                    className="daily-rail-row"
                    key={`fantasy-${entry.id}-${entry.gameId}`}
                    onClick={() => onOpenGame?.(entry.gameId)}
                  >
                    <span className="daily-rail-rank">{entry.rank}</span>
                    <PlayerAvatar player={entry} size={28} />
                    <span className="daily-rail-name">
                      <strong>{entry.name}</strong>
                      <small>{entry.teamAbbreviation} · {entry.statLine?.pts} PTS</small>
                    </span>
                    <strong className="daily-rail-value">{entry.display}</strong>
                  </button>
                ))}
                <SourceNote>Fantasy totals update with every live box score.</SourceNote>
              </section>

              <section className="daily-rail-card daily-rail-card--quiet">
                <p className="league-kicker">How to read this</p>
                <p>
                  Daily leaders are single-game lines, not season averages. Click any line to open
                  the full game center and its box score.
                </p>
                <p className="daily-rail-muted">
                  NBA day rolls over at midnight Eastern. A late West Coast game may appear on the
                  next date.
                </p>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
