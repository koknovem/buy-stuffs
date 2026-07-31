import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../Avatar';
import { useTripPolling } from '../useTripPolling';
import type { Ingredient, Trip } from '../types';

export function TripPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { trip, setTrip, loading, error } = useTripPolling(id);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!trip?.joinUrl) return;
    void QRCode.toDataURL(trip.joinUrl, { width: 220, margin: 1 }).then(setQr);
  }, [trip?.joinUrl]);

  const onTap = async (ing: Ingredient) => {
    if (!user) return;
    setActionError(null);
    try {
      let next: { trip: Trip };
      if (ing.status === 'open') {
        next = await api.claim(ing.id);
      } else if (ing.status === 'claimed' && ing.claimedBy === user.id) {
        next = await api.bought(ing.id);
      } else if (ing.status === 'claimed' && ing.claimedBy !== user.id) {
        return;
      } else {
        return;
      }
      setTrip(next.trip);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && id) {
        const fresh = await api.getTrip(id);
        setTrip(fresh.trip);
      }
      setActionError((err as Error).message);
    }
  };

  const release = async (ing: Ingredient) => {
    if (!user || ing.claimedBy !== user.id || ing.status !== 'claimed') return;
    try {
      const next = await api.release(ing.id);
      setTrip(next.trip);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  if (loading && !trip) {
    return (
      <div className="app-shell">
        <div className="spinner" />
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="app-shell">
        <p className="error">{error || 'Not found'}</p>
        <button className="action-btn" onClick={() => navigate('/')}>
          🏠
        </button>
      </div>
    );
  }

  const totalIngredients = trip.dishes.reduce((n, d) => n + d.ingredients.length, 0);

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <button className="chip-code" onClick={() => setShowQr((v) => !v)}>
          {trip.code}
        </button>
        <Link className="icon-btn" to={`/trip/${trip.id}/add`}>
          ＋
        </Link>
      </div>

      <div className="member-strip">
        {trip.members.map((m) => (
          <Avatar key={m.id} user={m} />
        ))}
      </div>

      {showQr && qr && (
        <div className="qr-wrap">
          <img src={qr} alt={trip.code} width={220} height={220} />
        </div>
      )}

      {trip.dishes.length === 0 && (
        <p className="muted" style={{ textAlign: 'center' }}>
          ＋ add a dish
        </p>
      )}

      <div className="stack">
        {trip.dishes.map((dish) => (
          <section key={dish.id} className="dish-block">
            <div className="dish-head">
              <span className="dish-head-icon">{dish.icon}</span>
              <strong className="dish-head-name">{dish.name}</strong>
              {dish.ingredients.length === 0 && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  ✨
                </span>
              )}
            </div>
            {dish.ingredients.length === 0 ? (
              <p className="muted empty-ings">no items — use ✨ then ✅</p>
            ) : (
              <ul className="shop-list">
                {dish.ingredients.map((ing) => {
                  const claimer = ing.claimedBy ? trip.userMap[ing.claimedBy] : null;
                  return (
                    <li key={ing.id}>
                      <button
                        type="button"
                        className={`shop-item ${ing.status}`}
                        onClick={() => void onTap(ing)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          void release(ing);
                        }}
                      >
                        <span className="ing-icon">{ing.icon}</span>
                        <div className="ing-meta">
                          <div className="ing-name">{ing.name}</div>
                        </div>
                        {ing.status === 'bought' ? (
                          <span style={{ fontSize: '1.4rem' }}>✔️</span>
                        ) : claimer ? (
                          <span className="row" style={{ gap: '0.35rem' }}>
                            {ing.claimedBy === user?.id && ing.status === 'claimed' && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="release"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void release(ing);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    void release(ing);
                                  }
                                }}
                                style={{ fontSize: '1.1rem' }}
                              >
                                ↩️
                              </span>
                            )}
                            <Avatar user={claimer} size="sm" />
                          </span>
                        ) : (
                          <span style={{ width: 28 }} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      {trip.dishes.length > 0 && totalIngredients === 0 && (
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.9rem' }}>
          tap ✨ on add dish to fill the buy list
        </p>
      )}

      {(actionError || error) && <p className="error">{actionError || error}</p>}
    </div>
  );
}
