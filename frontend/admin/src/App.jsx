import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext.jsx';
import { CompanyLogo } from './components/CompanyLogo.jsx';
import { Layout } from './components/Layout.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import EmployeesPage from './pages/EmployeesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

function RequireAdmin() {
  const { status } = useAuth();
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function Boot() {
  const { status, error, retry } = useAuth();
  return (
    <div className="boot">
      <CompanyLogo width="180" height="142" />
      {status === 'error' ? (
        <>
          <p role="alert">{error.message}</p>
          <button type="button" className="btn btn--primary" onClick={retry}>
            <RefreshCw aria-hidden="true" /> Try again
          </button>
        </>
      ) : (
        <LoaderCircle className="spin boot__spinner" aria-label="Loading" />
      )}
    </div>
  );
}

export default function App() {
  const { status } = useAuth();
  if (status === 'loading' || status === 'error') return <Boot />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
