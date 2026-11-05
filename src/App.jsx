import { useEffect, useMemo, useRef, useState } from 'react';
import DailyLeaders from './components/DailyLeaders.jsx';
import EraLab from './components/EraLab.jsx';
import GameCenter from './components/GameCenter.jsx';
import GameDetail from './components/GameDetail.jsx';
import PlayerDrawer from './components/PlayerDrawer.jsx';
import RecordsBook from './components/RecordsBook.jsx';
import Sidebar from './components/Sidebar.jsx';
import Standings from './components/Standings.jsx';
import StatsHub from './components/StatsHub.jsx';
import TitleBar from './components/TitleBar.jsx';
import TopNav from './components/TopNav.jsx';
import { useGame, useScoreboard } from './hooks/useNbaData.js';
import { nbaTodayKey } from './lib/format.js';
import { currentSeasonYear } from './lib/season.js';

const SECTION_LABELS = {
  games: 'NBA GAME CENTER',
  daily: 'DAILY LEADERS',
  stats: 'LEAGUE STATS',
  standings: 'STANDINGS',
  records: 'RECORD BOOK',
  era: 'ERA LAB',
};

const PAGE_ARIA = {
  games: 'NBA scores and games',
  daily: 'NBA daily stat leaders',
  stats: 'NBA team and player stats',
  standings: 'NBA standings',
  records: 'NBA record book',
  era: 'NBA era comparison lab',
};

export default function App() {
  const [page, setPage] = useState('games');
  const [dateKey, setDateKey] = useState(() => nbaTodayKey());
  const [dailyDate, setDailyDate] = useState(() => nbaTodayKey());
  const [leagueSeason, setLeagueSeason] = useState(() => currentSeasonYear());
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [filter, setFilter] = useState('all');
  const mainPanelRef = useRef(null);

  const {
    data: scoreboard,
    meta,
    loading,
    refreshing,
    error,
    refresh,
  } = useScoreboard(dateKey);

  const {
    data: game,
    meta: gameMeta,
    loading: gameLoading,
    refreshing: gameRefreshing,
    error: gameError,
    refresh: refreshGame,
  } = useGame(selectedGameId);

  const previewGame = useMemo(() => {
    if (!selectedGameId || !scoreboard?.games) return null;
    return scoreboard.games.find((entry) => String(entry.id) === String(selectedGameId)) || null;
  }, [scoreboard, selectedGameId]);

  const liveCount = useMemo(
    () => (scoreboard?.games || []).filter((entry) => entry.status?.state === 'in').length,
    [scoreboard],
  );

  const seasonYear = game?.seasonYear || previewGame?.seasonYear || scoreboard?.seasonYear;
  const seasonLabel = game?.seasonLabel || previewGame?.seasonLabel || scoreboard?.seasonLabel;

  const handleDateChange = (nextDate) => {
    if (!nextDate || nextDate === dateKey) return;
    setDateKey(nextDate);
    setSelectedGameId(null);
    setPlayerId(null);
  };

  const handleHome = () => {
    setPage('games');
    setDateKey(nbaTodayKey());
    setSelectedGameId(null);
    setPlayerId(null);
    setFilter('all');
  };

  const handleNavigate = (nextPage) => {
    setPlayerId(null);
    setSelectedGameId(null);
    setPage(nextPage);
  };

  const handleOpenGame = (gameId) => {
    setPage('games');
    setSelectedGameId(String(gameId));
    setPlayerId(null);
  };

  const handleDailyGame = (gameId) => {
    setDateKey(dailyDate);
    setPage('games');
    setSelectedGameId(String(gameId));
    setPlayerId(null);
  };

  const handleBack = () => {
    setSelectedGameId(null);
    setPlayerId(null);
    refresh();
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (playerId) {
        setPlayerId(null);
        return;
      }
      if (selectedGameId) setSelectedGameId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playerId, selectedGameId]);

  useEffect(() => {
    if (!selectedGameId) setPlayerId(null);
  }, [selectedGameId]);

  useEffect(() => {
    if (!mainPanelRef.current) return;
    mainPanelRef.current.scrollTop = 0;
  }, [page, selectedGameId]);

  const renderPage = () => {
    if (page === 'daily') {
      return (
        <DailyLeaders
          dateKey={dailyDate}
          onDateChange={setDailyDate}
          onOpenGame={handleDailyGame}
        />
      );
    }
    if (page === 'stats') {
      return <StatsHub seasonYear={leagueSeason} onSeasonChange={setLeagueSeason} />;
    }
    if (page === 'standings') {
      return <Standings seasonYear={leagueSeason} onSeasonChange={setLeagueSeason} />;
    }
    if (page === 'records') return <RecordsBook />;
    if (page === 'era') return <EraLab />;
    if (selectedGameId) {
      return (
        <GameDetail
          key={selectedGameId}
          gameId={selectedGameId}
          previewGame={previewGame}
          game={game}
          meta={gameMeta}
          loading={gameLoading}
          refreshing={gameRefreshing}
          error={gameError}
          onRefresh={refreshGame}
          onBack={handleBack}
          onOpenPlayer={(id) => setPlayerId(String(id))}
        />
      );
    }
    return (
      <GameCenter
        dateKey={dateKey}
        scoreboard={scoreboard}
        loading={loading}
        error={error}
        meta={meta}
        refreshing={refreshing}
        onRefresh={refresh}
        onOpenGame={handleOpenGame}
        filter={filter}
        onFilterChange={setFilter}
        onGoToday={() => handleDateChange(nbaTodayKey())}
        onDateChange={handleDateChange}
      />
    );
  };

  return (
    <div
      className={[
        'app-shell',
        page !== 'games' ? 'app-shell--league' : '',
        selectedGameId ? 'app-shell--detail' : '',
        playerId ? 'app-shell--drawer-open' : '',
      ].filter(Boolean).join(' ')}
    >
      <TitleBar
        liveCount={liveCount}
        seasonLabel={seasonLabel}
        sectionLabel={SECTION_LABELS[page]}
        onHome={handleHome}
      />
      <TopNav page={page} onNavigate={handleNavigate} liveCount={liveCount} />

      <div className={`app-body ${page !== 'games' ? 'app-body--league' : ''}`}>
        {page === 'games' ? (
          <Sidebar
            dateKey={dateKey}
            onDateChange={handleDateChange}
            scoreboard={scoreboard}
            loading={loading}
            error={error}
            activeGameId={selectedGameId}
            onSelectGame={handleOpenGame}
            filter={filter}
            onFilterChange={setFilter}
            meta={meta}
          />
        ) : null}

        <main className="main-panel" aria-label={PAGE_ARIA[page]} ref={mainPanelRef}>
          {renderPage()}
        </main>
      </div>

      {playerId && page === 'games' ? (
        <PlayerDrawer
          playerId={playerId}
          game={game}
          previewGame={previewGame}
          seasonYear={seasonYear}
          onClose={() => setPlayerId(null)}
          onOpenPlayer={(id) => setPlayerId(String(id))}
        />
      ) : null}
    </div>
  );
}
