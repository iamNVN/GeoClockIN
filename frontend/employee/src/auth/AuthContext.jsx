import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionExpired } from '../lib/api.js';
import { setOfficeTimeZone } from '../lib/format.js';
import { splashMinimumElapsed } from '../lib/splash.js';

const AuthContext = createContext(null);

/**
 * status: loading | authenticated | unauthenticated | error
 * When authenticated, exposes `employee`, `office`, `schedule` and `company`.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' });

  const applySession = useCallback((session) => {
    setOfficeTimeZone(session.schedule.timezone);
    setState({ status: 'authenticated', session });
  }, []);

  const restore = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const session = await api('/auth/me');
      await splashMinimumElapsed();
      applySession(session);
    } catch (error) {
      await splashMinimumElapsed();
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
    async ({ identifier, password, rememberMe }) => {
      const session = await api('/auth/login', { method: 'POST', body: { identifier, password, rememberMe } });
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setState({ status: 'unauthenticated' });
  }, []);

  const value = useMemo(
    () => ({
      status: state.status,
      error: state.error,
      sessionExpired: Boolean(state.expired),
      ...state.session,
      login,
      logout,
      retry: restore,
    }),
    [state, login, logout, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
