import { useEffect, useRef, useState } from 'react';
import type { Trip } from './types';
import { api } from './api';

const POLL_MS = 10_000;

export function useTripPolling(tripId: string | undefined) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const visible = useRef(true);

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const { trip: next } = await api.getTrip(tripId);
        if (!cancelled) {
          setTrip(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (!visible.current || cancelled) return;
      timer = window.setTimeout(async () => {
        if (!visible.current || cancelled) return;
        await load();
        schedule();
      }, POLL_MS);
    };

    const onVisibility = () => {
      visible.current = document.visibilityState === 'visible';
      if (visible.current) {
        void load().then(schedule);
      } else {
        window.clearTimeout(timer);
      }
    };

    visible.current = document.visibilityState === 'visible';
    void load().then(schedule);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tripId]);

  return { trip, setTrip, error, loading };
}
