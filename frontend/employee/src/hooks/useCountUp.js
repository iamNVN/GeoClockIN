import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from what is currently shown to `target` (ease-out). */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (target == null) return undefined;
    const from = shownRef.current;
    const show = (n) => {
      shownRef.current = n;
      setValue(n);
    };
    if (prefersReducedMotion() || from === target) {
      show(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (time) => {
      const t = Math.min(1, (time - start) / duration);
      show(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export function CountUp({ value, suffix = '' }) {
  const current = useCountUp(value);
  return value == null ? '—' : `${current}${suffix}`;
}
