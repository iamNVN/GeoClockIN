import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getCurrentPosition, locationPermission, toCoordinates } from '../lib/geolocation.js';

/**
 * Whether the employee is currently at the office, for the Home screen badge.
 * Checks automatically only if location permission was already granted, so the
 * permission prompt appears when the employee chooses to clock in or check.
 *
 * status: idle | checking | inside | outside | imprecise | denied | error
 */
export function useOfficeLocation() {
  const [state, setState] = useState({ status: 'idle' });
  const runRef = useRef(0);

  const check = useCallback(async ({ maximumAge = 0 } = {}) => {
    const run = ++runRef.current;
    setState({ status: 'checking' });
    try {
      const position = await getCurrentPosition({ maximumAge });
      const { verification } = await api('/attendance/verify-location', {
        method: 'POST',
        body: toCoordinates(position),
      });
      if (run !== runRef.current) return;
      const status = verification.ok ? 'inside' : verification.code === 'POOR_ACCURACY' ? 'imprecise' : 'outside';
      setState({ status, verification });
    } catch (error) {
      if (run !== runRef.current) return;
      setState({ status: error.code === 'PERMISSION_DENIED' ? 'denied' : 'error', error });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationPermission().then((permission) => {
      if (cancelled) return;
      if (permission === 'granted') check({ maximumAge: 60_000 });
      else if (permission === 'denied') setState({ status: 'denied' });
    });
    return () => {
      cancelled = true;
      runRef.current += 1;
    };
  }, [check]);

  return { ...state, check };
}
