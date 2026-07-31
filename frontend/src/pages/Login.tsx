import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { GoogleSignIn } from '../GoogleSignIn';
import { Avatar } from '../Avatar';

export function LoginPage() {
  const { setUser, user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate(user.needsNickname ? '/nickname' : '/', { replace: true });
    }
  }, [loading, user, navigate]);

  const onCredential = useCallback(
    async (token: string) => {
      setBusy(true);
      setError(null);
      try {
        const { user } = await api.loginGoogle(token);
        setUser(user);
        navigate(user.needsNickname ? '/nickname' : '/', { replace: true });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [navigate, setUser],
  );

  return (
    <div className="app-shell">
      <div className="hero-screen">
        <div>
          <p className="sub">shared dinner runs</p>
          <h1 className="brand">Buy Stuffs</h1>
        </div>
        <GoogleSignIn onCredential={onCredential} />
        {busy && <div className="spinner" />}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export function NicknamePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      const { user: next } = await api.setNickname(value);
      setUser(next);
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="hero-screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <Avatar user={user} size="lg" />
          <h1 className="brand" style={{ fontSize: '2rem' }}>
            {user?.googleName}
          </h1>
        </div>
        <input
          className="field"
          placeholder={user?.googleName || 'nickname'}
          value={nickname}
          maxLength={40}
          onChange={(e) => setNickname(e.target.value)}
        />
        <div className="row">
          <button
            className="action-btn wide"
            disabled={busy}
            onClick={() => void save(user?.googleName ?? null)}
          >
            ⏭️
          </button>
          <button
            className="action-btn primary wide"
            disabled={busy || !nickname.trim()}
            onClick={() => void save(nickname.trim())}
          >
            ✅
          </button>
        </div>
      </div>
    </div>
  );
}
