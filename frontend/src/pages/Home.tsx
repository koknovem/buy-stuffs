import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../Avatar';
import type { Trip } from '../types';

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.myTrips().then((r) => setTrips(r.trips));
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const { trip } = await api.createTrip();
      navigate(`/trip/${trip.id}`);
    } finally {
      setBusy(false);
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
        <button className="big-tile" disabled={busy} onClick={() => void create()}>
          ＋<span>new</span>
        </button>
        <Link className="big-tile" to="/join">
          🔗<span>join</span>
        </Link>
      </div>

      <div className="trip-tiles">
        {trips.map((t) => (
          <button key={t.id} className="trip-tile" onClick={() => navigate(`/trip/${t.id}`)}>
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
        ))}
      </div>
    </div>
  );
}
