import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import ClockPage from './pages/ClockPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SplashScreen from './pages/SplashScreen.jsx';
import SummaryPage from './pages/SummaryPage.jsx';

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function TabLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

export default function App() {
  const { status } = useAuth();

  return (
    <div className="app">
      {status === 'loading' || status === 'error' ? (
        <SplashScreen />
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<TabLayout />}>
              <Route index element={<HomePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="summary" element={<SummaryPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="clock/:action" element={<ClockPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}
