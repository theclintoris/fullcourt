import { CalendarDays, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { seasonLabelFor } from '../lib/season.js';

export function LeagueHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="league-header">
      <div className="league-header-copy">
        {eyebrow ? <p className="league-eyebrow">{eyebrow}</p> : null}
        <h1 className="league-title">{title}</h1>
        {description ? <p className="league-description">{description}</p> : null}
      </div>
      {actions ? <div className="league-actions">{actions}</div> : null}
      {children}
    </header>
  );
}

export function SeasonSelect({ value, onChange, options, disabled = false, label = 'Season' }) {
  return (
    <label className={`season-select ${disabled ? 'season-select--disabled' : ''}`}>
      <CalendarDays size={15} aria-hidden="true" />
      <span className="season-select-label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        aria-label="Select NBA season"
      >
        {options.map((year) => (
          <option value={year} key={year}>
            {seasonLabelFor(year)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DatePager({ dateKey, label, onPrevious, onNext, onToday, isToday, disabled = false }) {
  return (
    <div className="date-pager">
      <button
        type="button"
        className="date-pager-arrow"
        onClick={onPrevious}
        aria-label="Previous day"
        disabled={disabled}
      >
        <ChevronLeft size={17} />
      </button>
      <div className="date-pager-value">
        <span>{label}</span>
        {isToday ? <em>NBA today</em> : null}
      </div>
      <button
        type="button"
        className="date-pager-arrow"
        onClick={onNext}
        aria-label="Next day"
        disabled={disabled || isToday}
      >
        <ChevronRight size={17} />
      </button>
      {!isToday ? (
        <button type="button" className="date-pager-today" onClick={onToday}>
          Today
        </button>
      ) : null}
    </div>
  );
}

export function SourceNote({ children }) {
  return (
    <p className="league-source-note">
      <Info size={13} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function MiniStat({ label, value, detail, accent = false }) {
  return (
    <div className={`league-mini-stat ${accent ? 'league-mini-stat--accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}
