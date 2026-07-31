import { useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

export function ConnectionBanner() {
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowReconnected(false);
      return;
    }
    if (!wasOffline) return;
    setShowReconnected(true);
    const t = window.setTimeout(() => {
      setShowReconnected(false);
      setWasOffline(false);
    }, 1800);
    return () => window.clearTimeout(t);
  }, [online, wasOffline]);

  if (!online) {
    return (
      <div className="connection-banner offline" role="status" aria-live="assertive">
        You’re offline — we’ll sync when you’re back
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div className="connection-banner back" role="status" aria-live="polite">
        Back online
      </div>
    );
  }

  return null;
}
