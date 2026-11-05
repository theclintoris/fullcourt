import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDailyLeaders,
  fetchPlayerStats,
  fetchStandings,
  fetchTeamStats,
} from '../lib/api.js';
import { currentSeasonYear } from '../lib/season.js';

function useResource(loader, deps, { pollMs = 0, shouldPoll } = {}) {
  const [state, setState] = useState({
    data: null,
    meta: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const sequence = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(
    async (initial = false) => {
      const requestId = ++sequence.current;
      setState((previous) => ({
        ...previous,
        loading: initial && !previous.data,
        refreshing: !initial,
        error: initial ? null : previous.error,
      }));
      try {
        const result = await loaderRef.current();
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
    // The dependency list is supplied by the caller; loaderRef keeps the
    // latest closure without restarting every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    setState({ data: null, meta: null, loading: true, refreshing: false, error: null });
    load(true);
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!pollMs || !state.data || document.visibilityState !== 'visible') return undefined;
    if (shouldPoll && !shouldPoll(state.data)) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await load(false);
      if (!cancelled) timer = window.setTimeout(tick, pollMs);
    };
    timer = window.setTimeout(tick, pollMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (timer) window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollMs, load, shouldPoll, state.data]);

  const refresh = useCallback(() => load(false), [load]);
  return { ...state, refresh };
}

export function useTeamStats(seasonYear) {
  return useResource(() => fetchTeamStats(seasonYear), [seasonYear]);
}

export function usePlayerStats(seasonYear) {
  return useResource(() => fetchPlayerStats(seasonYear), [seasonYear]);
}

export function useStandings(seasonYear) {
  const isCurrent = Number(seasonYear) === currentSeasonYear();
  return useResource(() => fetchStandings(seasonYear), [seasonYear], {
    pollMs: isCurrent ? 60_000 : 0,
  });
}

export function useDailyLeaders(dateKey) {
  return useResource(() => fetchDailyLeaders(dateKey), [dateKey], {
    pollMs: 30_000,
    shouldPoll: (data) => (data?.liveGames || 0) > 0,
  });
}
