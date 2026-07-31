import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, friendlyError } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../Avatar';
import { useOnlineStatus } from '../useOnlineStatus';
import type { Trip } from '../types';

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const wasOnline = useRef(online);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await api.myTrips();
      setTrips(r.trips);
    } catch (err) {
      setError(friendlyError(err, 'Could not load trips'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrips();
  }, []);

  useEffect(() => {
    if (online && !wasOnline.current) void loadTrips();
    wasOnline.current = online;
  }, [online]);

  const create = async () => {
    if (!online) {
      setError('You’re offline. Try again when connected.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { trip } = await api.createTrip();
      navigate(`/trip/${trip.id}`);
    } catch (err) {
      setError(friendlyError(err, 'Could not create trip'));
    } finally {
      setBusy(false);
    }
  };

  const removeTrip = async (tripId: string) => {
    if (!online) {
      setError('You’re offline. Try again when connected.');
      return;
    }
    setDeletingId(tripId);
    setError(null);
    try {
      await api.deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err) {
      setError(friendlyError(err, 'Could not delete trip'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="row">
          <Avatar user={user} />
          <strong>{user?.displayName}</strong>
        </div>
        <button className="icon-btn" title="logout" onClick={() => void logout()}>
          🚪
        </button>
      </div>

      <h1 className="brand" style={{ fontSize: '2.4rem' }}>
        Buy Stuffs
      </h1>

      <div className="home-actions">
        <button className="big-tile" disabled={busy || !online} onClick={() => void create()}>
          ＋<span>new</span>
        </button>
        <Link className={`big-tile${!online ? ' disabled-link' : ''}`} to="/join">
          🔗<span>join</span>
        </Link>
      </div>

      {loading && trips.length === 0 && <div className="spinner" />}

      {error && (
        <div className="error-bar">
          <p className="error">{error}</p>
          <button type="button" className="text-btn" onClick={() => void loadTrips()}>
            Retry
          </button>
        </div>
      )}

      <div className="trip-tiles">
        {trips.map((t) => (
          <div key={t.id} className="trip-tile-row">
            <button
              type="button"
              className="trip-tile"
              onClick={() => navigate(`/trip/${t.id}`)}
            >
              <div>
                <div className="chip-code" style={{ display: 'inline-block' }}>
                  {t.code}
                </div>
                <div className="member-strip" style={{ marginTop: '0.5rem' }}>
                  {t.members.map((m) => (
                    <Avatar key={m.id} user={m} size="sm" />
                  ))}
                </div>
              </div>
              <span style={{ fontSize: '1.5rem' }}>🛒</span>
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="delete trip"
              disabled={!online || deletingId === t.id}
              onClick={(e) => {
                e.stopPropagation();
                void removeTrip(t.id);
              }}
            >
              {deletingId === t.id ? '⏳' : '🗑️'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
