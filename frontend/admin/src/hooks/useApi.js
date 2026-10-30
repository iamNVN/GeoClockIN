import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * GET `path` (skipped while null) and keep the result. Previous data stays
 * while reloading, so tables don't flash empty.
 */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error) => !cancelled && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
