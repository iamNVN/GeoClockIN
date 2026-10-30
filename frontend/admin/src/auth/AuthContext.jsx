import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionExpired } from '../lib/api.js';
import { setOfficeTimeZone } from '../lib/format.js';

const AuthContext = createContext(null);

/**
 * status: loading | authenticated | unauthenticated | error
 * Also holds the dashboard-wide selected date (defaults to today at the office).
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' });
  const [date, setDate] = useState(null);

  const applySession = useCallback((session) => {
    setOfficeTimeZone(session.organization.timezone);
    setDate((d) => d ?? session.today);
    setState({ status: 'authenticated', session });
  }, []);

  const restore = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      applySession(await api('/admin/auth/me'));
    } catch (error) {
      setState(error.status === 401 ? { status: 'unauthenticated' } : { status: 'error', error });
    }
  }, [applySession]);

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(
    () =>
      onSessionExpired(() =>
        setState((s) => (s.status === 'authenticated' ? { status: 'unauthenticated', expired: true } : s)),
      ),
    [],
  );

  const login = useCallback(
    async (credentials) => applySession(await api('/admin/auth/login', { method: 'POST', body: credentials })),
    [applySession],
  );

  const logout = useCallback(async () => {
    await api('/admin/auth/logout', { method: 'POST' });
    setState({ status: 'unauthenticated' });
  }, []);

  const updateAdmin = useCallback(
    (admin) => setState((s) => ({ ...s, session: { ...s.session, admin } })),
    [],
  );

  const value = useMemo(
    () => ({
      status: state.status,
      error: state.error,
      sessionExpired: Boolean(state.expired),
      admin: state.session?.admin,
      organization: state.session?.organization,
      today: state.session?.today,
      date: date ?? state.session?.today,
      setDate,
      login,
      logout,
      retry: restore,
      updateAdmin,
    }),
    [state, date, login, logout, restore, updateAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
