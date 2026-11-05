import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatSigned,
  recordLine,
  teamAccent,
  teamName,
} from '../lib/format.js';
import { playerGameAdvanced, sortBoxPlayers } from '../lib/advanced.js';
import {
  PlayerAvatar,
  SegmentedControl,
  TeamLogo,
} from './ui.jsx';

const VIEW_OPTIONS = [
  { id: 'traditional', label: 'Traditional' },
  { id: 'advanced', label: 'Advanced' },
];

function clickableRowProps(onClick, label) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
    'aria-label': label,
  };
}

function TraditionalTable({ players, context, analytics, onOpenPlayer }) {
  return (
    <>
      <div className="box-table-scroll">
        <table className="box-table">
          <thead>
            <tr>
              <th className="box-player-col" scope="col">Player</th>
              <th scope="col" title="Minutes">MIN</th>
              <th scope="col" title="Points">PTS</th>
              <th scope="col" title="Field goals made-attempted">FG</th>
              <th scope="col" title="Three-pointers made-attempted">3PT</th>
              <th scope="col" title="Free throws made-attempted">FT</th>
              <th scope="col" title="Total rebounds">REB</th>
              <th scope="col" title="Assists">AST</th>
              <th scope="col" title="Turnovers">TO</th>
              <th scope="col" title="Steals">STL</th>
              <th scope="col" title="Blocks">BLK</th>
              <th scope="col" className="box-col-optional" title="Offensive rebounds">OREB</th>
              <th scope="col" className="box-col-optional" title="Defensive rebounds">DREB</th>
              <th scope="col" className="box-col-optional" title="Personal fouls">PF</th>
              <th scope="col" title="Plus/minus while on court">+/-</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const stats = player.stats;
              if (!stats) return null;
              return (
                <tr
                  key={player.id}
                  className="box-row"
                  {...clickableRowProps(() => onOpenPlayer(player.id), `Open ${player.name} profile`)}
                >
                  <td className="box-player-cell">
                    <span className="box-jersey">{player.jersey || '—'}</span>
                    <PlayerAvatar player={player} size={32} />
                    <span className="box-player-copy">
                      <span className="box-player-name">
                        {player.name}
                        {player.starter ? <span className="box-starter">S</span> : null}
                      </span>
                      <span className="box-player-meta">
                        {player.position || '—'}
                        {player.starter ? ' · Starter' : ''}
                      </span>
                    </span>
                    <ChevronRight className="box-row-chevron" size={15} />
                  </td>
                  <td className="box-num">{formatDecimal(stats.min, 0)}</td>
                  <td className="box-num box-num--strong">{formatNumber(stats.pts)}</td>
                  <td className="box-num">{stats.fg || '0-0'}</td>
                  <td className="box-num">{stats.threePt || '0-0'}</td>
                  <td className="box-num">{stats.ft || '0-0'}</td>
                  <td className="box-num">{formatNumber(stats.reb)}</td>
                  <td className="box-num">{formatNumber(stats.ast)}</td>
                  <td className="box-num">{formatNumber(stats.tov)}</td>
                  <td className="box-num">{formatNumber(stats.stl)}</td>
                  <td className="box-num">{formatNumber(stats.blk)}</td>
                  <td className="box-num box-col-optional">{formatNumber(stats.oreb)}</td>
                  <td className="box-num box-col-optional">{formatNumber(stats.dreb)}</td>
                  <td className="box-num box-col-optional">{formatNumber(stats.pf)}</td>
                  <td className={`box-num ${Number(stats.plusMinus) > 0 ? 'box-plus--positive' : Number(stats.plusMinus) < 0 ? 'box-plus--negative' : ''}`.trim()}>
                    {formatSigned(stats.plusMinus)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="box-player-cell box-total-cell">
                <span className="box-total-label">Team totals</span>
              </td>
              <td className="box-num">{formatDecimal(context.totalMinutes, 0)}</td>
              <td className="box-num box-num--strong">{formatNumber(context.score)}</td>
              <td className="box-num">{context.values.fgm ?? 0}-{context.values.fga ?? 0}</td>
              <td className="box-num">{context.values.tpm ?? 0}-{context.values.tpa ?? 0}</td>
              <td className="box-num">{context.values.ftm ?? 0}-{context.values.fta ?? 0}</td>
              <td className="box-num">{formatNumber(context.values.reb)}</td>
              <td className="box-num">{formatNumber(context.values.ast)}</td>
              <td className="box-num">{formatNumber(context.values.tov)}</td>
              <td className="box-num">{formatNumber(context.values.stl)}</td>
              <td className="box-num">{formatNumber(context.values.blk)}</td>
              <td className="box-num box-col-optional">{formatNumber(context.values.oreb)}</td>
              <td className="box-num box-col-optional">{formatNumber(context.values.dreb)}</td>
              <td className="box-num box-col-optional">{formatNumber(context.values.pf)}</td>
              <td className="box-num">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="box-team-notes">
        <span>
          {context.values.fgm ?? 0}-{context.values.fga ?? 0} FG
          <span className="box-note-dot" />
          {context.values.fgPct !== undefined ? `${formatDecimal(context.values.fgPct, 1)}%` : '—'} from the field
        </span>
        <span>
          {formatNumber(context.values.paint)} paint points
          <span className="box-note-dot" />
          {formatNumber(context.values.fastBreak)} fast break
        </span>
      </div>
    </>
  );
}

function AdvancedTable({ players, context, analytics, onOpenPlayer }) {
  const teamAdvanced = analytics.teamAdvanced[context.team?.id] || {};
  return (
    <>
      <div className="box-table-scroll">
        <table className="box-table">
          <thead>
            <tr>
              <th className="box-player-col" scope="col">Player</th>
              <th scope="col" title="Minutes">MIN</th>
              <th scope="col" title="True shooting percentage">TS%</th>
              <th scope="col" title="Effective field goal percentage">eFG%</th>
              <th scope="col" title="Usage rate">USG%</th>
              <th scope="col" title="Assist percentage">AST%</th>
              <th scope="col" title="Rebound percentage">REB%</th>
              <th scope="col" title="Player impact estimate">PIE</th>
              <th scope="col" title="Game score">GmSc</th>
              <th scope="col" title="Plus/minus">+/-</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              if (!player.stats) return null;
              const advanced = playerGameAdvanced(
                player.stats,
                context,
                analytics.gameTotals,
              );
              return (
                <tr
                  key={player.id}
                  className="box-row"
                  {...clickableRowProps(() => onOpenPlayer(player.id), `Open ${player.name} profile`)}
                >
                  <td className="box-player-cell">
                    <span className="box-jersey">{player.jersey || '—'}</span>
                    <PlayerAvatar player={player} size={32} />
                    <span className="box-player-copy">
                      <span className="box-player-name">
                        {player.name}
                        {player.starter ? <span className="box-starter">S</span> : null}
                      </span>
                      <span className="box-player-meta">
                        {player.position || '—'}
                        {player.starter ? ' · Starter' : ''}
                      </span>
                    </span>
                    <ChevronRight className="box-row-chevron" size={15} />
                  </td>
                  <td className="box-num">{formatDecimal(player.stats.min, 0)}</td>
                  <td className="box-num">{formatPercent(advanced?.ts)}</td>
                  <td className="box-num">{formatPercent(advanced?.efg)}</td>
                  <td className="box-num">{formatPercent(advanced?.usg)}</td>
                  <td className="box-num">{formatPercent(advanced?.astPct)}</td>
                  <td className="box-num">{formatPercent(advanced?.rebPct)}</td>
                  <td className="box-num">{formatDecimal(advanced?.pie, 1)}</td>
                  <td className="box-num box-num--strong">{formatDecimal(advanced?.gameScore, 1)}</td>
                  <td className={`box-num ${Number(player.stats.plusMinus) > 0 ? 'box-plus--positive' : Number(player.stats.plusMinus) < 0 ? 'box-plus--negative' : ''}`.trim()}>
                    {formatSigned(player.stats.plusMinus)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="box-player-cell box-total-cell"><span className="box-total-label">Team totals</span></td>
              <td className="box-num">{formatDecimal(context.totalMinutes, 0)}</td>
              <td className="box-num">{formatPercent(teamAdvanced.ts)}</td>
              <td className="box-num">{formatPercent(teamAdvanced.efg)}</td>
              <td className="box-num">—</td>
              <td className="box-num">{formatPercent(teamAdvanced.astRate)}</td>
              <td className="box-num">{formatPercent(teamAdvanced.orebPct)}</td>
              <td className="box-num">{formatDecimal(teamAdvanced.pie, 1)}</td>
              <td className="box-num">—</td>
              <td className="box-num">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="box-team-notes">
        <span>
          {formatPercent(teamAdvanced.tovPct)} turnover rate
          <span className="box-note-dot" />
          {formatDecimal(teamAdvanced.pointsPerPossession, 3)} points / possession
        </span>
        <span>
          {formatDecimal(teamAdvanced.possessions, 1)} possessions
          <span className="box-note-dot" />
          {formatPercent(teamAdvanced.ftRate)} free-throw rate
        </span>
      </div>
    </>
  );
}

function TeamBox({ group, context, analytics, view, onOpenPlayer }) {
  const [showDnp, setShowDnp] = useState(false);
  const players = sortBoxPlayers(group.athletes || []).filter((player) => player.stats && !player.didNotPlay);
  const didNotPlay = (group.athletes || []).filter((player) => player.didNotPlay || !player.stats);
  const team = context?.team || group;
  const accent = teamAccent(team);

  return (
    <section className="box-team" style={{ '--team-accent': accent }}>
      <div className="box-team-head">
        <div className="box-team-identity">
          <TeamLogo team={team} size={40} />
          <div>
            <span className="box-team-location">{team?.location || teamName(team, false)}</span>
            <h2>{team?.name || teamName(team, false)}</h2>
            <span className="box-team-record">{recordLine(team) || group.teamName}</span>
          </div>
        </div>
        <div className="box-team-summary">
          <span>
            <em>PTS</em>
            {formatNumber(context?.score)}
          </span>
          <span>
            <em>FG</em>
            {formatPercent(context?.values?.fgPct)}
          </span>
          <span>
            <em>3PT</em>
            {formatPercent(context?.values?.tpPct)}
          </span>
          <span>
            <em>REB</em>
            {formatNumber(context?.values?.reb)}
          </span>
        </div>
      </div>

      {view === 'traditional' ? (
        <TraditionalTable
          players={players}
          context={context}
          analytics={analytics}
          onOpenPlayer={onOpenPlayer}
        />
      ) : (
        <AdvancedTable
          players={players}
          context={context}
          analytics={analytics}
          onOpenPlayer={onOpenPlayer}
        />
      )}

      {didNotPlay.length ? (
        <div className="dnp-block">
          <button type="button" className="dnp-toggle" onClick={() => setShowDnp((value) => !value)}>
            Did not play
            <span>{didNotPlay.length}</span>
            <ChevronRight size={14} className={showDnp ? 'dnp-chevron dnp-chevron--open' : 'dnp-chevron'} />
          </button>
          {showDnp ? (
            <div className="dnp-list">
              {didNotPlay.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  className="dnp-player"
                  onClick={() => onOpenPlayer(player.id)}
                >
                  <PlayerAvatar player={player} size={22} />
                  <span>{player.name}</span>
                  <em>{player.reason || 'Coach’s decision'}</em>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function BoxScore({ game, analytics, onOpenPlayer }) {
  const [view, setView] = useState('traditional');

  if (!analytics || !game?.players?.length) {
    return (
      <div className="boxscore-empty">
        <p>The box score will appear here when the game data is available.</p>
      </div>
    );
  }

  const groups = game.players.filter((group) => group.athletes?.length);

  return (
    <div className="boxscore">
      <div className="boxscore-toolbar">
        <div>
          <span className="eyebrow">Player lines</span>
          <p>Click any player to open the full profile, season stats and game log.</p>
        </div>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Stat view"
        />
      </div>

      {groups.map((group) => (
        <TeamBox
          key={group.teamId}
          group={group}
          context={analytics.contexts[group.teamId]}
          analytics={analytics}
          view={view}
          onOpenPlayer={onOpenPlayer}
        />
      ))}

      <p className="boxscore-disclaimer">
        Advanced metrics are derived from this box score using standard basketball formulas.
        They are not official NBA advanced statistics.
      </p>
    </div>
  );
}
