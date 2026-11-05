import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchGame,
  fetchPlayer,
  fetchPlayerGames,
  fetchScoreboard,
} from '../lib/api.js';

const scoreboardInitial = {
  data: null,
  meta: null,
  loading: true,
  refreshing: false,
  error: null,
};

export function useScoreboard(dateKey) {
  const [state, setState] = useState(scoreboardInitial);
  const sequence = useRef(0);

  const load = useCallback(
    async (initial = false) => {
      if (!dateKey) return;
      const requestId = ++sequence.current;

      setState((previous) => {
        if (initial) {
          return { ...scoreboardInitial, loading: true };
        }
        return {
          ...previous,
          refreshing: true,
          error: previous.data ? previous.error : null,
        };
      });

      try {
        const result = await fetchScoreboard(dateKey);
        if (sequence.current !== requestId) return;
        setState({
          data: result.data,
          meta: result.meta,
          loading: false,
          refreshing: false,
          error: null,
        });
      } catch (error) {
        if (sequence.current !== requestId) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          refreshing: false,
          error,
        }));
      }
    },
    [dateKey],
  );

  useEffect(() => {
    if (!dateKey) return undefined;
    load(true);
    return () => {
      sequence.current += 1;
    };
  }, [dateKey, load]);

  const refresh = useCallback(() => load(false), [load]);
  const hasLive = Boolean(
    state.data?.games?.some((game) => game.status?.state === 'in'),
  );

  useEffect(() => {
    if (!dateKey || !hasLive) return undefined;

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        await load(false);
      }
      if (!cancelled) timer = window.setTimeout(tick, 20_000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      if (timer) window.clearTimeout(timer);
      tick();
    };

    timer = window.setTimeout(tick, 20_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dateKey, hasLive, load]);

  return { ...state, refresh };
}

const gameInitial = {
  data: null,
  gameId: null,
  meta: null,
  loading: false,
  refreshing: false,
  error: null,
};

export function useGame(gameId) {
  const [state, setState] = useState(gameInitial);
  const sequence = useRef(0);

  const load = useCallback(
    async (initial = false) => {
      if (!gameId) return;
      const requestId = ++sequence.current;

      setState((previous) => {
        const sameGame = previous.gameId === String(gameId);
        if (initial) {
          return {
            ...gameInitial,
            gameId: String(gameId),
            loading: true,
            data: sameGame ? previous.data : null,
            meta: sameGame ? previous.meta : null,
          };
        }
        return {
          ...previous,
          gameId: String(gameId),
          refreshing: true,
        };
      });

      try {
        const result = await fetchGame(gameId);
        if (sequence.current !== requestId) return;
        setState({
          data: result.data,
          gameId: String(gameId),
          meta: result.meta,
          loading: false,
          refreshing: false,
          error: null,
        });
      } catch (error) {
        if (sequence.current !== requestId) return;
        setState((previous) => ({
          ...previous,
          gameId: String(gameId),
          loading: false,
          refreshing: false,
          error,
        }));
      }
    },
    [gameId],
  );

  useEffect(() => {
    if (!gameId) {
      setState(gameInitial);
      return undefined;
    }
    load(true);
    return () => {
      sequence.current += 1;
    };
  }, [gameId, load]);

  const phase = state.data?.status?.state;
  useEffect(() => {
    if (!gameId || phase === 'post') return undefined;

    let cancelled = false;
    let timer = null;
    const delay = phase === 'in' ? 12_000 : 30_000;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        await load(false);
      }
      if (!cancelled) timer = window.setTimeout(tick, delay);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      if (timer) window.clearTimeout(timer);
      tick();
    };

    timer = window.setTimeout(tick, delay);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [gameId, phase, load]);

  const refresh = useCallback(() => load(false), [load]);
  const visibleData = state.gameId === String(gameId) ? state.data : null;

  return {
    data: visibleData,
    meta: state.meta,
    loading: state.loading || (Boolean(gameId) && !visibleData && !state.error),
    refreshing: state.refreshing,
    error: state.error,
    refresh,
  };
}

const playerInitial = {
  profile: null,
  games: null,
  loading: false,
  gamesLoading: false,
  error: null,
  gamesError: null,
};

export function usePlayer(playerId, seasonYear) {
  const [state, setState] = useState(playerInitial);
  const sequence = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!playerId) {
      setState(playerInitial);
      return undefined;
    }

    let cancelled = false;
    const requestId = ++sequence.current;
    setState({
      ...playerInitial,
      loading: true,
      gamesLoading: true,
    });

    (async () => {
      const [profileResult, gamesResult] = await Promise.allSettled([
        fetchPlayer(playerId, seasonYear),
        fetchPlayerGames(playerId, seasonYear),
      ]);

      if (cancelled || sequence.current !== requestId) return;

      const profile = profileResult.status === 'fulfilled'
        ? profileResult.value.data
        : null;
      const games = gamesResult.status === 'fulfilled'
        ? gamesResult.value.data
        : null;

      setState({
        profile,
        games,
        loading: false,
        gamesLoading: false,
        error: profileResult.status === 'rejected' ? profileResult.reason : null,
        gamesError: gamesResult.status === 'rejected' ? gamesResult.reason : null,
      });
    })();

    return () => {
      cancelled = true;
      sequence.current += 1;
    };
  }, [playerId, seasonYear, reloadToken]);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  return { ...state, retry };
}
