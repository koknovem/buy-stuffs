import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { AiLoadingPanel } from '../AiLoadingPanel';
import { api, ApiError, friendlyError, isNetworkError } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../Avatar';
import { useOnlineStatus } from '../useOnlineStatus';
import { useTripPolling } from '../useTripPolling';
import type { Ingredient, Trip } from '../types';

const FILL_RETRY_MS = 4_000;

export function TripPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { trip, setTrip, loading, error, syncing, refresh } = useTripPolling(id);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filling, setFilling] = useState<Record<string, boolean>>({});
  const [pendingIng, setPendingIng] = useState<string | null>(null);
  const [fillTick, setFillTick] = useState(0);
  const fillAttempted = useRef<Set<string>>(new Set());
  const fillFailAt = useRef<Map<string, number>>(new Map());
  const fillingRef = useRef<Set<string>>(new Set());

  const inviteLink = trip ? `${window.location.origin}/join/${trip.code}` : '';

  useEffect(() => {
    if (!inviteLink) return;
    void QRCode.toDataURL(inviteLink, { width: 220, margin: 1 }).then(setQr);
  }, [inviteLink]);

  useEffect(() => {
    if (!online) return;
    const fails = [...fillFailAt.current.values()];
    if (fails.length === 0) return;
    const wait = Math.max(0, Math.min(...fails.map((t) => t + FILL_RETRY_MS - Date.now())));
    const timer = window.setTimeout(() => setFillTick((n) => n + 1), wait + 30);
    return () => window.clearTimeout(timer);
  }, [online, fillTick, actionError, trip]);

  useEffect(() => {
    if (!trip || !id || !online) return;
    const now = Date.now();
    const empty = trip.dishes.filter((d) => {
      if (d.ingredients.length > 0) return false;
      if (fillingRef.current.has(d.id)) return false;
      if (!fillAttempted.current.has(d.id)) return true;
      const failedAt = fillFailAt.current.get(d.id);
      return failedAt != null && now - failedAt >= FILL_RETRY_MS;
    });
    if (empty.length === 0) return;

    let cancelled = false;
    const run = async () => {
      for (const dish of empty) {
        if (cancelled) return;
        fillAttempted.current.add(dish.id);
        fillFailAt.current.delete(dish.id);
        fillingRef.current.add(dish.id);
        setFilling((prev) => ({ ...prev, [dish.id]: true }));
        try {
          const { trip: next } = await api.fillDish(id, dish.id);
          if (!cancelled) setTrip(next);
        } catch (err) {
          if (!cancelled) {
            fillFailAt.current.set(dish.id, Date.now());
            setActionError(friendlyError(err, 'Could not generate shopping list'));
            setFillTick((n) => n + 1);
          }
        } finally {
          fillingRef.current.delete(dish.id);
          if (!cancelled) {
            setFilling((prev) => {
              const copy = { ...prev };
              delete copy[dish.id];
              return copy;
            });
          }
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [trip, id, setTrip, online, fillTick]);

  const onTap = async (ing: Ingredient) => {
    if (!user || pendingIng) return;
    if (!online) {
      setActionError('You’re offline. Try again when connected.');
      return;
    }
    if (ing.status === 'claimed' && ing.claimedBy !== user.id) return;

    setActionError(null);
    setPendingIng(ing.id);
    try {
      let next: { trip: Trip };
      if (ing.status === 'open') {
        next = await api.claim(ing.id);
      } else if (ing.status === 'claimed' && ing.claimedBy === user.id) {
        next = await api.bought(ing.id);
      } else if (ing.status === 'bought') {
        next = await api.resetIngredient(ing.id);
      } else {
        return;
      }
      setTrip(next.trip);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && id) {
        try {
          const fresh = await api.getTrip(id);
          setTrip(fresh.trip);
        } catch {
          /* ignore */
        }
      } else if (isNetworkError(err) && id) {
        try {
          await refresh();
        } catch {
          /* ignore */
        }
      }
      setActionError(friendlyError(err));
    } finally {
      setPendingIng(null);
    }
  };

  const resetAll = async () => {
    if (!id || !trip) return;
    if (!online) {
      setActionError('You’re offline. Try again when connected.');
      return;
    }
    setActionError(null);
    try {
      const { trip: next } = await api.resetTrip(id);
      setTrip(next);
    } catch (err) {
      setActionError(friendlyError(err));
    }
  };

  const release = async (ing: Ingredient) => {
    if (!user || ing.claimedBy !== user.id || ing.status !== 'claimed') return;
    if (!online) {
      setActionError('You’re offline. Try again when connected.');
      return;
    }
    setPendingIng(ing.id);
    try {
      const next = await api.release(ing.id);
      setTrip(next.trip);
      setActionError(null);
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setPendingIng(null);
    }
  };

  const retryFill = (dishId: string) => {
    fillAttempted.current.delete(dishId);
    fillFailAt.current.delete(dishId);
    setActionError(null);
    setFillTick((n) => n + 1);
  };

  const onInviteCodeClick = async () => {
    const link = inviteLink;
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } finally {
          document.body.removeChild(ta);
        }
      }
    }
    setShowQr((v) => !v);
  };

  if (loading && !trip) {
    return (
      <div className="app-shell">
        <div className="spinner" />
        <p className="muted" style={{ textAlign: 'center' }}>
          Loading trip…
        </p>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="app-shell">
        <p className="error">{error || 'Not found'}</p>
        <button className="action-btn primary wide" type="button" onClick={() => void refresh()}>
          Retry
        </button>
        <button className="action-btn" onClick={() => navigate('/')}>
          🏠
        </button>
      </div>
    );
  }

  const totalIngredients = trip.dishes.reduce((n, d) => n + d.ingredients.length, 0);
  const hasProgress = trip.dishes.some((d) =>
    d.ingredients.some((i) => i.status !== 'open'),
  );
  const allBought =
    totalIngredients > 0 &&
    trip.dishes.every((d) => d.ingredients.every((i) => i.status === 'bought'));
  const hasFailedFill = trip.dishes.some(
    (d) => d.ingredients.length === 0 && !filling[d.id] && fillFailAt.current.has(d.id),
  );

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <button
          className="chip-code"
          type="button"
          title="copy invite link"
          onClick={() => void onInviteCodeClick()}
        >
          {copied ? '📋' : trip.code}
        </button>
        <div className="row" style={{ gap: '0.35rem' }}>
          {syncing && <span className="sync-dot" title="syncing" aria-label="syncing" />}
          {hasProgress && (
            <button
              className="icon-btn"
              type="button"
              title="reset all"
              onClick={() => void resetAll()}
            >
              🔄
            </button>
          )}
          <Link className="icon-btn" to={`/trip/${trip.id}/add`}>
            ＋
          </Link>
        </div>
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
              {(dish.ingredients.length === 0 || filling[dish.id]) && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {filling[dish.id] ? '⏳' : '✨'}
                </span>
              )}
            </div>
            {dish.ingredients.length === 0 ? (
              filling[dish.id] ? (
                <AiLoadingPanel
                  title={`AI 寫緊「${dish.name}」買餸清單`}
                  detail="通常要幾秒，網絡唔穩都會自動再試～"
                />
              ) : fillFailAt.current.has(dish.id) ? (
                <div className="fill-retry">
                  <p className="muted empty-ings">未能產生清單</p>
                  <button
                    type="button"
                    className="text-btn"
                    disabled={!online}
                    onClick={() => retryFill(dish.id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="muted empty-ings">✨ 準備產生清單…</p>
              )
            ) : (
              <ul className="shop-list">
                {dish.ingredients.map((ing) => {
                  const claimer = ing.claimedBy ? trip.userMap[ing.claimedBy] : null;
                  return (
                    <li key={ing.id}>
                      <button
                        type="button"
                        className={`shop-item ${ing.status}${pendingIng === ing.id ? ' pending' : ''}`}
                        disabled={pendingIng === ing.id}
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
                          <span style={{ fontSize: '1.4rem' }} title="tap to reset">
                            ✔️
                          </span>
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

      {allBought && (
        <button className="action-btn primary wide" type="button" onClick={() => void resetAll()}>
          🔄
        </button>
      )}

      {hasFailedFill && online && (
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.9rem' }}>
          Auto-retrying shopping lists…
        </p>
      )}

      {(actionError || error) && (
        <div className="error-bar">
          <p className="error">{actionError || error}</p>
          <button type="button" className="text-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
