import {
  BarChart3,
  FlaskConical,
  ListOrdered,
  Radio,
  Trophy,
  Zap,
} from 'lucide-react';

export const PAGE_ITEMS = [
  { id: 'games', label: 'Scores', icon: Radio },
  { id: 'daily', label: 'Daily Leaders', icon: Zap },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'standings', label: 'Standings', icon: ListOrdered },
  { id: 'records', label: 'Records', icon: Trophy },
  { id: 'era', label: 'Era Lab', icon: FlaskConical },
];

export default function TopNav({ page, onNavigate, liveCount = 0 }) {
  return (
    <nav className="topnav" aria-label="FullCourt sections">
      <div className="topnav-inner" role="tablist" aria-label="Sections">
        {PAGE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={active}
              className={`topnav-item ${active ? 'topnav-item--active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="topnav-status">
        <span className={`topnav-status-dot ${liveCount ? 'is-live' : ''}`} />
        <span>{liveCount ? `${liveCount} games live` : 'NBA data feed'}</span>
      </div>
    </nav>
  );
}
