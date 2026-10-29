import { useEffect, useState } from 'react';

/**
 * False on the first paint, true shortly after. Lets bars, rings and markers
 * render at their start value and then transition to the real one.
 */
export function useEntered(delay = 80) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setEntered(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return entered;
}
