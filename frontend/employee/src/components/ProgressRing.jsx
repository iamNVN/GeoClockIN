import { useEntered } from '../hooks/useEntered.js';

/** Circular progress (0–100) that sweeps in from zero. */
export function ProgressRing({ value, size = 120, stroke = 12, tone = 'brand', children }) {
  const entered = useEntered();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = entered ? Math.max(0, Math.min(100, value ?? 0)) : 0;
  const center = size / 2;

  return (
    <div className={`ring ring--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={center} cy={center} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  );
}
