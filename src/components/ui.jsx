import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { teamAccent, teamInitials } from '../lib/format.js';

export function LogoMark({ size = 27 }) {
  return (
    <span
      className="logo-mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="9" fill="#f2732c" />
        <path d="M5.5 5.5v21M26.5 5.5v21" stroke="#0a0c11" strokeWidth="1.4" opacity=".7" />
        <path d="M16 4v24" stroke="#0a0c11" strokeWidth="1.2" opacity=".55" />
        <circle cx="16" cy="16" r="5.2" stroke="#0a0c11" strokeWidth="1.6" />
        <path d="M16 4v5.2M16 22.8V28" stroke="#0a0c11" strokeWidth="1.1" opacity=".5" />
        <circle cx="16" cy="16" r="1.35" fill="#0a0c11" />
      </svg>
    </span>
  );
}

export function TeamLogo({ team, size = 28, className = '' }) {
  const src = team?.logo || '';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={`team-logo ${className}`.trim()}
      style={{
        width: size,
        height: size,
        '--team-color': teamAccent(team),
        '--logo-size': `${size}px`,
      }}
    >
      {!failed && src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable="false"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="team-logo-fallback">{teamInitials(team)}</span>
      )}
    </span>
  );
}

function initialsForName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'NBA';
}

export function PlayerAvatar({ player, size = 36, className = '', eager = false }) {
  const src = player?.headshot || '';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={`player-avatar ${className}`.trim()}
      style={{ width: size, height: size, '--logo-size': `${size}px` }}
    >
      {!failed && src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable="false"
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="player-avatar-fallback">{initialsForName(player?.name || player?.shortName)}</span>
      )}
    </span>
  );
}

export function LiveDot({ muted = false }) {
  return <span className={`live-dot ${muted ? 'live-dot--muted' : ''}`} aria-hidden="true" />;
}

export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function LoadingLabel({ children = 'Loading' }) {
  return (
    <span className="loading-label" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function ErrorState({ error, title = 'Could not load this data', description, onRetry, compact = false }) {
  const message = description || (typeof error === 'string'
    ? error
    : error?.message || 'The NBA feed did not respond. Try again.');
  return (
    <div className={`state-panel state-panel--error ${compact ? 'state-panel--compact' : ''}`.trim()} role="alert">
      <span className="state-panel-icon" aria-hidden="true">
        <AlertTriangle size={compact ? 18 : 22} />
      </span>
      <div className="state-panel-copy">
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="button button--ghost button--small" onClick={onRetry}>
          <RefreshCw size={14} />
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className={`state-panel state-panel--empty ${compact ? 'state-panel--compact' : ''}`.trim()}>
      {Icon ? (
        <span className="state-panel-icon" aria-hidden="true">
          <Icon size={compact ? 18 : 24} />
        </span>
      ) : null}
      <div className="state-panel-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function BackButton({ onClick, label = 'Back' }) {
  return (
    <button type="button" className="back-button" onClick={onClick}>
      <ArrowLeft size={16} />
      <span>{label}</span>
    </button>
  );
}

export function IconButton({ label, onClick, children, className = '', disabled = false }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function RefreshButton({ onClick, refreshing = false, label = 'Refresh' }) {
  return (
    <button
      type="button"
      className="button button--ghost button--small refresh-button"
      onClick={onClick}
      disabled={refreshing}
    >
      <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
      <span>{refreshing ? 'Refreshing' : label}</span>
    </button>
  );
}

export function Tabs({ tabs, active, onChange, ariaLabel = 'Views', className = '' }) {
  const id = useId();
  const buttons = useRef(new Map());

  const handleKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    const next = tabs[nextIndex];
    onChange(next.id);
    buttons.current.get(next.id)?.focus();
  };

  return (
    <div className={`tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) buttons.current.set(tab.id, element);
              else buttons.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${id}-${tab.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`tab ${selected ? 'tab--active' : ''}`.trim()}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="tab-count">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`segmented-option ${value === option.id ? 'segmented-option--active' : ''}`.trim()}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined ? <span className="segmented-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, actions, className = '' }) {
  return (
    <div className={`section-heading ${className}`.trim()}>
      <div className="section-heading-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="section-heading-actions">{actions}</div> : null}
    </div>
  );
}
