import { useId } from 'react';

/** The GeoClockIN map-pin-with-clock mark. */
export function LogoMark({ size = 64, className }) {
  const gradientId = `logo${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={className} width={size} height={size * (74 / 64)} viewBox="0 0 64 74" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#27bb7a" />
          <stop offset="1" stopColor="#0a6a43" />
        </linearGradient>
      </defs>
      <path d="M32 2C17.6 2 6 13.4 6 27.6 6 47 32 72 32 72s26-25 26-44.4C58 13.4 46.4 2 32 2z" fill={`url(#${gradientId})`} />
      <circle cx="32" cy="27.5" r="16.5" fill="#fff" />
      <path
        d="M32 18.5v9.6l6.2 3.7"
        fill="none"
        stroke="#0f8a57"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`}>
      GeoClock<span className="wordmark__accent">IN</span>
    </span>
  );
}
