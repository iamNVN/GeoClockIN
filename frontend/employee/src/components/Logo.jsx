// The logo lives in public/brand so index.html's launch splash can use the
// same cached URLs before the app bundle loads.

/** Full logo: pin mark with the GeoClockIN wordmark. */
export function BrandLogo({ width = 220, className = '' }) {
  return (
    <img
      className={`brand-logo ${className}`}
      src="/brand/logo.webp"
      width={width}
      height={Math.round(width * (887 / 1124))}
      alt="GeoClockIN"
      decoding="async"
    />
  );
}

