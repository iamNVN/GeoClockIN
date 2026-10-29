import { useEffect, useState } from 'react';
import { serverNow } from '../lib/clock.js';

/** Server-aligned current time, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
