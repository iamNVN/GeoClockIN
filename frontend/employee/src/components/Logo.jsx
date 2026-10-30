// The company logo (uploaded in the admin dashboard, or the default GeoClockIN
// logo). index.html's launch splash uses the same URL.
const LOGO_URL = '/api/branding/logo';
const FALLBACK_URL = '/brand/logo.webp';

export function BrandLogo({ width = 220, className = '' }) {
  return (
    <img
      className={`brand-logo ${className}`}
      src={LOGO_URL}
      width={width}
      height={Math.round(width * (887 / 1124))}
      alt="GeoClockIN"
      decoding="async"
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(FALLBACK_URL)) event.currentTarget.src = FALLBACK_URL;
      }}
    />
  );
}
