import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

/** Google OAuth redirect landing: ?credential=… or hash; finishes login then goes home. */
export function RedirectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, user, loading } = useAuth();

  useEffect(() => {
    const run = async () => {
      const credential =
        params.get('credential') ||
        params.get('id_token') ||
        new URLSearchParams(window.location.hash.replace(/^#/, '')).get('id_token');

      if (credential) {
        try {
          const { user: next } = await api.loginGoogle(credential);
          setUser(next);
          navigate(next.needsNickname ? '/nickname' : '/', { replace: true });
          return;
        } catch {
          navigate('/login', { replace: true });
          return;
        }
      }

      if (!loading) {
        if (user) navigate(user.needsNickname ? '/nickname' : '/', { replace: true });
        else navigate('/login', { replace: true });
      }
    };
    void run();
  }, [params, navigate, setUser, user, loading]);

  return (
    <div className="app-shell">
      <div className="spinner" />
    </div>
  );
}
