import logoUrl from '../assets/logo.webp';
import logoMarkUrl from '../assets/logo-mark.webp';

/** Full logo: pin mark with the GeoClockIN wordmark. */
export function BrandLogo({ width = 220, className = '' }) {
  return (
    <img
      className={`brand-logo ${className}`}
      src={logoUrl}
      width={width}
      height={Math.round(width * (887 / 1124))}
      alt="GeoClockIN"
      decoding="async"
    />
  );
}

/** Pin mark only. Decorative: pair it with visible text. */
export function BrandMark({ size = 40, className = '' }) {
  return (
    <img
      className={`brand-mark ${className}`}
      src={logoMarkUrl}
      width={Math.round(size * (574 / 692))}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
