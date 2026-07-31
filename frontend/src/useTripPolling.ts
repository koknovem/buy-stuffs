import { useEffect, useRef, useState } from 'react';
import type { Trip } from './types';
import { api, ApiError, friendlyError, isNetworkError } from './api';
import { useOnlineStatus } from './useOnlineStatus';

const POLL_MS = 10_000;
const FAST_POLL_MS = 3_000;

export function useTripPolling(tripId: string | undefined) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const visible = useRef(true);
  const online = useOnlineStatus();
  const hadTrip = useRef(false);
  const failStreak = useRef(0);
  const tripIdRef = useRef(tripId);

  useEffect(() => {
    if (tripIdRef.current !== tripId) {
      tripIdRef.current = tripId;
      hadTrip.current = false;
      failStreak.current = 0;
      setTrip(null);
      setLoading(Boolean(tripId));
      setError(null);
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;
    let timer: number | undefined;

    const load = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent && !hadTrip.current) setLoading(true);
      if (hadTrip.current) setSyncing(true);
      try {
        const { trip: next } = await api.getTrip(tripId);
        if (!cancelled) {
          setTrip(next);
          hadTrip.current = true;
          failStreak.current = 0;
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        failStreak.current += 1;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setError(friendlyError(err, 'Trip not found'));
          if (!hadTrip.current) setTrip(null);
          return;
        }
        if (!hadTrip.current) {
          setError(friendlyError(err, 'Could not load trip'));
        } else if (isNetworkError(err) || failStreak.current >= 2) {
          setError(friendlyError(err, 'Could not refresh trip'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSyncing(false);
        }
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (!visible.current || cancelled) return;
      const nextDelay = !online || failStreak.current > 0 ? FAST_POLL_MS : POLL_MS;
      timer = window.setTimeout(async () => {
        if (!visible.current || cancelled) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          schedule();
          return;
        }
        await load({ silent: true });
        schedule();
      }, nextDelay);
    };

    const onVisibility = () => {
      visible.current = document.visibilityState === 'visible';
      if (visible.current) {
        void load({ silent: hadTrip.current }).then(schedule);
      } else {
        window.clearTimeout(timer);
      }
    };

    visible.current = document.visibilityState === 'visible';
    void load({ silent: hadTrip.current }).then(schedule);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tripId, online]);

  const refresh = async () => {
    if (!tripId) return;
    setError(null);
    try {
      const { trip: next } = await api.getTrip(tripId);
      setTrip(next);
      hadTrip.current = true;
      failStreak.current = 0;
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Could not refresh trip'));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { trip, setTrip, error, loading, syncing, refresh };
}
