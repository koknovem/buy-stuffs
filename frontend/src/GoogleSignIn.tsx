import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export function GoogleSignIn({ onCredential }: { onCredential: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tryInit = () => {
      if (cancelled || !ref.current || !window.google || !CLIENT_ID) return false;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: { credential: string }) => {
          onCredential(response.credential);
        },
        ux_mode: 'popup',
      });
      ref.current.innerHTML = '';
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 280,
      });
      return true;
    };

    if (tryInit()) return;
    const id = window.setInterval(() => {
      if (tryInit()) window.clearInterval(id);
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [onCredential]);

  return <div className="google-btn" ref={ref} />;
}
