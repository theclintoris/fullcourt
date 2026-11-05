import {
  formatDecimal,
  formatNumber,
  formatPercent,
  recordLine,
  shootingPercent,
  teamAccent,
  teamName,
} from '../lib/format.js';
import { SectionHeading, TeamLogo } from './ui.jsx';

function CompareRow({ label, awayValue, homeValue, awayRaw, homeRaw, hint, awayDisplay, homeDisplay }) {
  const numericAway = Number(awayRaw);
  const numericHome = Number(homeRaw);
  const hasNumbers = Number.isFinite(numericAway) && Number.isFinite(numericHome);
  const max = hasNumbers ? Math.max(Math.abs(numericAway), Math.abs(numericHome)) : 0;
  const awayWidth = max > 0 ? Math.max(4, (Math.abs(numericAway) / max) * 100) : 0;
  const homeWidth = max > 0 ? Math.max(4, (Math.abs(numericHome) / max) * 100) : 0;

  return (
    <div className="compare-row">
      <span className="compare-value compare-value--away">{awayDisplay ?? formatNumber(awayValue ?? awayRaw)}</span>
      <div className="compare-middle">
        <span className="compare-label" title={hint || undefined}>{label}</span>
        <div className="compare-bars" aria-hidden="true">
          <div className="compare-track compare-track--away">
            <span style={{ width: `${awayWidth}%` }} />
          </div>
          <div className="compare-track compare-track--home">
            <span style={{ width: `${homeWidth}%` }} />
          </div>
        </div>
      </div>
      <span className="compare-value compare-value--home">{homeDisplay ?? formatNumber(homeValue ?? homeRaw)}</span>
    </div>
  );
}

function CompareSection({ title, children }) {
  return (
    <div className="compare-section">
      <h3>{title}</h3>
      <div className="compare-rows">{children}</div>
    </div>
  );
}

function FourFactorCard({ label, value, hint }) {
  return (
    <div className="factor-card">
      <span className="factor-label">{label}</span>
      <strong>{value}</strong>
      <span className="factor-hint">{hint}</span>
    </div>
  );
}

function FactorTeam({ context, advanced }) {
  const team = context.team;
  return (
    <div className="factor-team" style={{ '--team-accent': teamAccent(team) }}>
      <div className="factor-team-head">
        <TeamLogo team={team} size={34} />
        <div>
          <strong>{teamName(team, true)}</strong>
          <span>{recordLine(team)}</span>
        </div>
      </div>
      <div className="factor-grid">
        <FourFactorCard label="eFG%" value={formatPercent(advanced?.efg)} hint="Effective field goal" />
        <FourFactorCard label="TOV%" value={formatPercent(advanced?.tovPct)} hint="Turnover rate" />
        <FourFactorCard label="OREB%" value={formatPercent(advanced?.orebPct)} hint="Off. rebound rate" />
        <FourFactorCard label="FT rate" value={formatPercent(advanced?.ftRate)} hint="FTs per FGA" />
      </div>
      <div className="factor-meta">
        <span>
          <em>PIE</em>
          {formatDecimal(advanced?.pie, 1)}
        </span>
        <span>
          <em>Poss.</em>
          {formatDecimal(advanced?.possessions, 1)}
        </span>
        <span>
          <em>PPP</em>
          {formatDecimal(advanced?.pointsPerPossession, 3)}
        </span>
        <span>
          <em>PTS</em>
          {formatNumber(context.score)}
        </span>
      </div>
    </div>
  );
}

export default function TeamStats({ game, analytics }) {
  const away = game.away;
  const home = game.home;
  const awayContext = analytics.contexts[away?.id];
  const homeContext = analytics.contexts[home?.id];
  const awayAdvanced = analytics.teamAdvanced[away?.id] || {};
  const homeAdvanced = analytics.teamAdvanced[home?.id] || {};

  if (!awayContext || !homeContext) {
    return <p className="team-stats-empty">Team statistics are not available for this game.</p>;
  }

  const a = awayContext.values;
  const h = homeContext.values;
  const fgPctAway = a.fgPct ?? Number(shootingPercent(a.fgm, a.fga).replace('%', ''));
  const fgPctHome = h.fgPct ?? Number(shootingPercent(h.fgm, h.fga).replace('%', ''));
  const tpPctAway = a.tpPct ?? Number(shootingPercent(a.tpm, a.tpa).replace('%', ''));
  const tpPctHome = h.tpPct ?? Number(shootingPercent(h.tpm, h.tpa).replace('%', ''));
  const ftPctAway = a.ftPct ?? Number(shootingPercent(a.ftm, a.fta).replace('%', ''));
  const ftPctHome = h.ftPct ?? Number(shootingPercent(h.ftm, h.fta).replace('%', ''));

  return (
    <div
      className="team-stats"
      style={{
        '--away-color': teamAccent(away),
        '--home-color': teamAccent(home),
      }}
    >
      <div className="compare-header">
        <div className="compare-team compare-team--away">
          <TeamLogo team={away} size={56} />
          <div>
            <span>{away?.location || ''}</span>
            <strong>{teamName(away, false)}</strong>
            <em>{recordLine(away)}</em>
          </div>
          <span className="compare-team-score">{away?.score ?? '—'}</span>
        </div>
        <div className="compare-header-center">
          <span className="eyebrow">Team comparison</span>
          <span className="compare-vs">VS</span>
          <span className="compare-game-status">{game.status?.detail || ''}</span>
        </div>
        <div className="compare-team compare-team--home">
          <span className="compare-team-score">{home?.score ?? '—'}</span>
          <div>
            <span>{home?.location || ''}</span>
            <strong>{teamName(home, false)}</strong>
            <em>{recordLine(home)}</em>
          </div>
          <TeamLogo team={home} size={56} />
        </div>
      </div>

      <div className="compare-column-head">
        <span>{away?.abbreviation}</span>
        <span>TEAM STATS</span>
        <span>{home?.abbreviation}</span>
      </div>

      <div className="compare-grid">
        <CompareSection title="Scoring">
          <CompareRow label="Points" awayRaw={awayContext.score} homeRaw={homeContext.score} />
          <CompareRow
            label="Field goals"
            awayDisplay={`${a.fgm ?? 0}-${a.fga ?? 0}`}
            homeDisplay={`${h.fgm ?? 0}-${h.fga ?? 0}`}
            awayRaw={a.fgm}
            homeRaw={h.fgm}
          />
          <CompareRow
            label="Three-pointers"
            awayDisplay={`${a.tpm ?? 0}-${a.tpa ?? 0}`}
            homeDisplay={`${h.tpm ?? 0}-${h.tpa ?? 0}`}
            awayRaw={a.tpm}
            homeRaw={h.tpm}
          />
          <CompareRow
            label="Free throws"
            awayDisplay={`${a.ftm ?? 0}-${a.fta ?? 0}`}
            homeDisplay={`${h.ftm ?? 0}-${h.fta ?? 0}`}
            awayRaw={a.ftm}
            homeRaw={h.ftm}
          />
          <CompareRow label="Paint points" awayRaw={a.paint} homeRaw={h.paint} />
          <CompareRow label="Fast-break points" awayRaw={a.fastBreak} homeRaw={h.fastBreak} />
          <CompareRow label="Points off turnovers" awayRaw={a.turnoverPoints} homeRaw={h.turnoverPoints} />
          <CompareRow label="Largest lead" awayRaw={a.largestLead} homeRaw={h.largestLead} />
        </CompareSection>

        <CompareSection title="Shooting">
          <CompareRow
            label="FG%"
            awayDisplay={formatPercent(fgPctAway)}
            homeDisplay={formatPercent(fgPctHome)}
            awayRaw={fgPctAway}
            homeRaw={fgPctHome}
          />
          <CompareRow
            label="3PT%"
            awayDisplay={formatPercent(tpPctAway)}
            homeDisplay={formatPercent(tpPctHome)}
            awayRaw={tpPctAway}
            homeRaw={tpPctHome}
          />
          <CompareRow
            label="FT%"
            awayDisplay={formatPercent(ftPctAway)}
            homeDisplay={formatPercent(ftPctHome)}
            awayRaw={ftPctAway}
            homeRaw={ftPctHome}
          />
          <CompareRow
            label="True shooting"
            awayDisplay={formatPercent(awayAdvanced.ts)}
            homeDisplay={formatPercent(homeAdvanced.ts)}
            awayRaw={awayAdvanced.ts}
            homeRaw={homeAdvanced.ts}
            hint="Points per true shooting attempt"
          />
          <CompareRow
            label="Effective FG"
            awayDisplay={formatPercent(awayAdvanced.efg)}
            homeDisplay={formatPercent(homeAdvanced.efg)}
            awayRaw={awayAdvanced.efg}
            homeRaw={homeAdvanced.efg}
            hint="Field goal percentage adjusted for three-point value"
          />
          <CompareRow
            label="Free-throw rate"
            awayDisplay={formatPercent(awayAdvanced.ftRate)}
            homeDisplay={formatPercent(homeAdvanced.ftRate)}
            awayRaw={awayAdvanced.ftRate}
            homeRaw={homeAdvanced.ftRate}
            hint="Free throw attempts per field goal attempt"
          />
        </CompareSection>

        <CompareSection title="Rebounding & control">
          <CompareRow label="Rebounds" awayRaw={a.reb} homeRaw={h.reb} />
          <CompareRow label="Offensive rebounds" awayRaw={a.oreb} homeRaw={h.oreb} />
          <CompareRow label="Defensive rebounds" awayRaw={a.dreb} homeRaw={h.dreb} />
          <CompareRow
            label="Off. rebound %"
            awayDisplay={formatPercent(awayAdvanced.orebPct)}
            homeDisplay={formatPercent(homeAdvanced.orebPct)}
            awayRaw={awayAdvanced.orebPct}
            homeRaw={homeAdvanced.orebPct}
            hint="Share of available offensive rebounds"
          />
          <CompareRow label="Assists" awayRaw={a.ast} homeRaw={h.ast} />
          <CompareRow
            label="Assist rate"
            awayDisplay={formatPercent(awayAdvanced.astRate)}
            homeDisplay={formatPercent(homeAdvanced.astRate)}
            awayRaw={awayAdvanced.astRate}
            homeRaw={homeAdvanced.astRate}
            hint="Assisted field goals per made field goal"
          />
          <CompareRow label="Turnovers" awayRaw={a.tov} homeRaw={h.tov} />
          <CompareRow label="Steals" awayRaw={a.stl} homeRaw={h.stl} />
          <CompareRow label="Blocks" awayRaw={a.blk} homeRaw={h.blk} />
          <CompareRow label="Fouls" awayRaw={a.pf} homeRaw={h.pf} />
        </CompareSection>
      </div>

      <div className="four-factors-block">
        <SectionHeading
          eyebrow="Derived metrics"
          title="The four factors"
          description="Dean Oliver’s four factors, calculated from this game’s box score."
        />
        <div className="factor-teams">
          <FactorTeam context={awayContext} advanced={awayAdvanced} />
          <FactorTeam context={homeContext} advanced={homeAdvanced} />
        </div>
      </div>

      <p className="team-stats-footnote">
        Advanced values are derived locally from the box score, not from an official NBA feed.
        Percentages are shown against standard basketball denominators.
      </p>
    </div>
  );
}
