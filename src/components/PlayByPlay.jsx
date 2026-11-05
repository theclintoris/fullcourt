import { useMemo, useState } from 'react';
import {
  CircleDot,
  Clock3,
  ListOrdered,
} from 'lucide-react';
import {
  formatGameClock,
  gamePhase,
  periodLabel,
  periodShort,
  teamName,
} from '../lib/format.js';
import {
  EmptyState,
  SegmentedControl,
  TeamLogo,
} from './ui.jsx';

function playScore(play) {
  if (!Number.isFinite(play.awayScore) || !Number.isFinite(play.homeScore)) return null;
  return `${play.awayScore}–${play.homeScore}`;
}

function clockSeconds(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.includes(':')) {
    const [minutes, seconds] = text.split(':').map(Number);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) ? seconds : null;
}

function newestFirst(a, b) {
  const clockA = clockSeconds(a.clock);
  const clockB = clockSeconds(b.clock);
  if (clockA !== null && clockB !== null && clockA !== clockB) {
    return clockA - clockB;
  }
  return (Number(b.sequence) || 0) - (Number(a.sequence) || 0);
}

function latestScoreForPeriod(plays) {
  const withScore = [...plays]
    .sort(newestFirst)
    .find((play) => Number.isFinite(play.awayScore) && Number.isFinite(play.homeScore));
  return withScore || null;
}

function PlayRow({ play, away, home }) {
  const team = String(play.teamId) === String(away?.id)
    ? away
    : String(play.teamId) === String(home?.id)
      ? home
      : null;
  const score = playScore(play);

  return (
    <div className={`play-row ${play.scoringPlay ? 'play-row--score' : ''}`.trim()}>
      <div className="play-time">
        <span>{formatGameClock(play.clock) || '—'}</span>
      </div>
      <div className="play-marker" aria-hidden="true">
        <span className={play.scoringPlay ? 'play-marker-dot play-marker-dot--score' : 'play-marker-dot'} />
      </div>
      <div className="play-content">
        <div className="play-copy">
          {team ? <TeamLogo team={team} size={22} className="play-team-logo" /> : null}
          <p>{play.text || play.shortDescription || 'Play'}</p>
        </div>
        <div className="play-meta">
          {play.type ? <span>{play.type}</span> : null}
          {play.participantNames?.length ? (
            <span className="play-players">
              {play.participantNames.slice(0, 3).join(' · ')}
            </span>
          ) : null}
          {play.scoringPlay ? (
            <span className="play-points">+{play.scoreValue || 0}</span>
          ) : null}
        </div>
      </div>
      <div className={`play-score ${play.scoringPlay ? 'play-score--active' : ''}`.trim()}>
        {score || <span className="play-score-empty">—</span>}
      </div>
    </div>
  );
}

export default function PlayByPlay({ game, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const plays = game?.plays || [];
  const scoringCount = plays.filter((play) => play.scoringPlay).length;

  const periods = useMemo(() => {
    const grouped = new Map();
    for (const play of plays) {
      const key = Number(play.period) || 0;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(play);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => b - a)
      .map(([period, periodPlays]) => ({
        period,
        plays: [...periodPlays].sort(newestFirst),
        latest: latestScoreForPeriod(periodPlays),
      }));
  }, [plays]);

  if (!plays.length) {
    const live = gamePhase(game) === 'live';
    return (
      <EmptyState
        icon={live ? ListOrdered : Clock3}
        title={live ? 'Play-by-play is catching up' : 'Play-by-play has not started'}
        description={live
          ? 'The feed has not published plays yet. Give it a moment and refresh.'
          : 'Every possession will appear here once the game is underway.'}
        action={<button type="button" className="button button--ghost button--small" onClick={onRefresh}>Refresh</button>}
      />
    );
  }

  return (
    <div className="pbp">
      <div className="pbp-toolbar">
        <div>
          <span className="eyebrow">Possession log</span>
          <p>{plays.length} plays · newest first</p>
        </div>
        <SegmentedControl
          options={[
            { id: 'all', label: 'All plays', count: plays.length },
            { id: 'scoring', label: 'Scoring', count: scoringCount },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter plays"
        />
      </div>

      <div className="pbp-feed">
        {periods.map((periodGroup) => {
          const visiblePlays = filter === 'scoring'
            ? periodGroup.plays.filter((play) => play.scoringPlay)
            : periodGroup.plays;
          if (!visiblePlays.length) return null;
          const latest = periodGroup.latest;
          return (
            <section className="pbp-period" key={periodGroup.period}>
              <div className="pbp-period-head">
                <span className="pbp-period-title">
                  <CircleDot size={14} />
                  {periodLabel(periodGroup.period)}
                  <em>{periodShort(periodGroup.period)}</em>
                </span>
                {latest ? (
                  <span className="pbp-period-score">
                    {game.away?.abbreviation} {latest.awayScore}
                    <span>–</span>
                    {latest.homeScore} {game.home?.abbreviation}
                  </span>
                ) : null}
              </div>
              <div className="pbp-period-plays">
                {visiblePlays.map((play) => (
                  <PlayRow
                    key={`${play.id}-${play.sequence}`}
                    play={play}
                    away={game.away}
                    home={game.home}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {filter === 'scoring' && !scoringCount ? (
        <EmptyState
          icon={ListOrdered}
          title="No scoring plays yet"
          description="The first bucket is still waiting to happen."
          compact
        />
      ) : null}

      <p className="pbp-footnote">
        Play descriptions and clock are provided by ESPN. Latest plays appear first.
        <span className="pbp-matchup">
          {teamName(game.away)} at {teamName(game.home)}
        </span>
      </p>
    </div>
  );
}
