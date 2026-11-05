export class ApiError extends Error {
  constructor(message, code = 'UNKNOWN', detail = '') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

export function hasDesktopBridge() {
  return typeof window !== 'undefined' && Boolean(window.fullcourt);
}

function getBridge() {
  if (!hasDesktopBridge()) {
    throw new ApiError(
      'The FullCourt desktop bridge is unavailable. Launch the packaged app or run Electron.',
      'NO_BRIDGE',
    );
  }
  return window.fullcourt;
}

function decodeResponse(response) {
  if (!response?.ok) {
    throw new ApiError(
      response?.error?.message || 'NBA data is unavailable right now.',
      response?.error?.code || 'UNKNOWN',
    );
  }

  return { data: response.data, meta: response.meta || null };
}

async function unwrap(promise) {
  let response;
  try {
    response = await promise;
  } catch (error) {
    throw new ApiError(
      'FullCourt could not reach the desktop data service. Try again in a moment.',
      'BRIDGE_FAILURE',
      error instanceof Error ? error.message : String(error),
    );
  }

  return decodeResponse(response);
}

export function fetchScoreboard(dateKey) {
  const digits = String(dateKey || '').replace(/-/g, '');
  return unwrap(getBridge().scoreboard(digits || null));
}

export function fetchGame(gameId) {
  return unwrap(getBridge().game(String(gameId)));
}

export function fetchPlayer(playerId, seasonYear) {
  return unwrap(getBridge().player(String(playerId), seasonYear));
}

export function fetchPlayerGames(playerId, seasonYear) {
  return unwrap(getBridge().playerGames(String(playerId), seasonYear));
}

export function fetchTeamStats(seasonYear) {
  return unwrap(getBridge().teamStats(seasonYear));
}

export function fetchPlayerStats(seasonYear) {
  return unwrap(getBridge().playerStats(seasonYear));
}

export function fetchStandings(seasonYear) {
  return unwrap(getBridge().standings(seasonYear));
}

export function fetchDailyLeaders(dateKey) {
  const digits = String(dateKey || '').replace(/-/g, '');
  return unwrap(getBridge().dailyLeaders(digits || null));
}

export function hasRecordsBridge() {
  return hasDesktopBridge() && typeof window.fullcourt.records === 'function';
}

export function fetchRecords() {
  return unwrap(getBridge().records());
}

export function refreshRecords() {
  return unwrap(getBridge().refreshRecords());
}

export function onRecordsUpdated(listener) {
  if (!hasRecordsBridge() || typeof window.fullcourt.onRecordsUpdated !== 'function') {
    return () => {};
  }
  return window.fullcourt.onRecordsUpdated((response) => {
    try {
      listener(decodeResponse(response));
    } catch {
      // A background update should never break the open record book.
    }
  });
}

export function onRecordsSyncError(listener) {
  if (!hasRecordsBridge() || typeof window.fullcourt.onRecordsSyncError !== 'function') {
    return () => {};
  }
  return window.fullcourt.onRecordsSyncError((response) => {
    listener(response?.error?.message || 'Records sync failed.');
  });
}

export function windowControls() {
  if (!hasDesktopBridge()) return null;
  return window.fullcourt.windowControls;
}

export function prefetchPlayer(playerId, seasonYear) {
  if (!hasDesktopBridge() || !playerId) return;
  // These promises feed the main-process cache. Failures are intentionally
  // ignored: hover should never surface an error.
  getBridge().player(String(playerId), seasonYear).catch(() => {});
  getBridge().playerGames(String(playerId), seasonYear).catch(() => {});
}
