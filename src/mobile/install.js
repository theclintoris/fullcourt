import { Capacitor, CapacitorHttp } from '@capacitor/core';

const REQUEST_TIMEOUT_MS = 22_000;

function abortError() {
  return new DOMException('The request was aborted.', 'AbortError');
}

function installNativeFetch() {
  if (window.__fullcourtFetchBridge) return;
  window.__fullcourtFetchBridge = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!/^https?:\/\//i.test(url)) return originalFetch(input, init);

    if (init.signal?.aborted) throw abortError();

    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);

    try {
      const headers = {};
      new Headers(init.headers || {}).forEach((value, key) => {
        headers[key] = value;
      });

      const result = await CapacitorHttp.request({
        url,
        method: (init.method || 'GET').toUpperCase(),
        headers,
        data: init.body ?? undefined,
        responseType: 'text',
        connectTimeout: REQUEST_TIMEOUT_MS,
        readTimeout: REQUEST_TIMEOUT_MS,
      });

      if (controller.signal.aborted) throw abortError();

      const responseHeaders = {};
      for (const [key, value] of Object.entries(result.headers || {})) {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }

      // CapacitorHttp parses JSON responses into objects even when responseType
      // is "text". The services expect a real Response and call .json(), so
      // serialize objects back into a JSON string before constructing it.
      const body =
        typeof result.data === 'string'
          ? result.data
          : result.data == null
            ? ''
            : JSON.stringify(result.data);

      return new Response(body, {
        status: result.status || 200,
        headers: responseHeaders,
      });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    }
  };
}

function normalizeError(error) {
  if (!error) return { code: 'UNEXPECTED', message: 'Something went wrong while loading NBA data.' };
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return { code: 'TIMEOUT', message: 'The NBA data service took too long to respond.' };
  }
  return {
    code: error.code || 'UNEXPECTED',
    message: error.message || 'Something went wrong while loading NBA data.',
  };
}

async function call(loader) {
  try {
    const result = await loader();
    return {
      ok: true,
      data: result?.data ?? result,
      meta: {
        fetchedAt: result?.fetchedAt || Date.now(),
        stale: Boolean(result?.stale),
        warning: result?.warning || null,
      },
    };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

const noop = () => Promise.resolve();
const noopUnsubscribe = () => {};

export async function installMobileBridge() {
  if (typeof window === 'undefined' || window.fullcourt) return false;
  if (!Capacitor.isNativePlatform()) return false;

  installNativeFetch();
  const { default: services } = await import('./generated-service.js');

  window.fullcourt = {
    scoreboard: (date) => call(() => services.getScoreboard(date)),
    game: (gameId) => call(() => services.getGame(gameId)),
    player: (playerId, seasonYear) => call(() => services.getPlayer(playerId, seasonYear)),
    playerGames: (playerId, seasonYear) =>
      call(() => services.getPlayerGames(playerId, seasonYear)),
    teamStats: (seasonYear) => call(() => services.getTeamStats(seasonYear)),
    playerStats: (seasonYear) => call(() => services.getPlayerStats(seasonYear)),
    standings: (seasonYear) => call(() => services.getStandings(seasonYear)),
    dailyLeaders: (date) => call(() => services.getDailyLeaders(date)),
    windowControls: {
      minimize: noop,
      toggleMaximize: noop,
      close: noop,
      isMaximized: () => Promise.resolve(false),
      onMaximizedChange: () => noopUnsubscribe,
    },
  };

  document.documentElement.classList.add('fullcourt-native');
  document.body.classList.add('fullcourt-native');
  document.body.dataset.platform = Capacitor.getPlatform();
  return true;
}
