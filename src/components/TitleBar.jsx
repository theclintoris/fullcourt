import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { windowControls } from '../lib/api.js';
import { LiveDot, LogoMark } from './ui.jsx';

export default function TitleBar({
  liveCount = 0,
  seasonLabel = '',
  sectionLabel = 'NBA GAME CENTER',
  onHome,
}) {
  const [maximized, setMaximized] = useState(false);
  const controls = windowControls();

  useEffect(() => {
    if (!controls) return undefined;
    let active = true;
    let unsubscribe = null;

    controls.isMaximized().then((value) => {
      if (active) setMaximized(Boolean(value));
    }).catch(() => {});

    unsubscribe = controls.onMaximizedChange((value) => {
      if (active) setMaximized(value);
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [controls]);

  const toggleMaximize = () => {
    controls?.toggleMaximize();
  };

  const handleDoubleClick = (event) => {
    if (event.target.closest('button, a, input')) return;
    toggleMaximize();
  };

  return (
    <header className="titlebar" onDoubleClick={handleDoubleClick}>
      <button type="button" className="titlebar-brand" onClick={onHome} aria-label="FullCourt home">
        <LogoMark size={24} />
        <span className="titlebar-wordmark">FULLCOURT</span>
        <span className="titlebar-rule" aria-hidden="true" />
        <span className="titlebar-section">{sectionLabel}</span>
      </button>

      <div className="titlebar-meta">
        {liveCount > 0 ? (
          <span className="titlebar-live">
            <LiveDot />
            <span>{liveCount} LIVE</span>
          </span>
        ) : (
          <span className="titlebar-live titlebar-live--quiet">NBA</span>
        )}
        <span className="titlebar-season">{seasonLabel || 'NBA'}</span>
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="window-button"
          onClick={() => controls?.minimize()}
          aria-label="Minimize window"
          title="Minimize"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-button"
          onClick={toggleMaximize}
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="window-button window-button--close"
          onClick={() => controls?.close()}
          aria-label="Close window"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
