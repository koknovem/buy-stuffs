import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage, NicknamePage } from './pages/Login';
import { HomePage } from './pages/Home';
import { JoinPage } from './pages/Join';
import { TripPage } from './pages/Trip';
import { AddDishPage } from './pages/AddDish';
import { RedirectPage } from './pages/Redirect';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = window.location.pathname;
  if (loading) {
    return (
      <div className="app-shell">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.needsNickname && loc !== '/nickname') {
    return <Navigate to="/nickname" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/redirect" element={<RedirectPage />} />
      <Route
        path="/nickname"
        element={
          <RequireAuth>
            <NicknamePage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/join"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join/:code"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />
      <Route
        path="/trip/:id"
        element={
          <RequireAuth>
            <TripPage />
          </RequireAuth>
        }
      />
      <Route
        path="/trip/:id/add"
        element={
          <RequireAuth>
            <AddDishPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
