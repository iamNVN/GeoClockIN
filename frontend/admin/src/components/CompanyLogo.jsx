import { useAuth } from '../auth/AuthContext.jsx';

const FALLBACK_URL = `${import.meta.env.BASE_URL}logo.webp`;

/** URL of the company logo; the version changes whenever a new logo is uploaded. */
export function useLogoUrl() {
  const { organization } = useAuth();
  return `/api/branding/logo?v=${organization?.logoVersion ?? 'default'}`;
}

/** The uploaded company logo, or the default GeoClockIN logo. */
export function CompanyLogo({ width, height, className = '', alt = 'GeoClockIN' }) {
  const src = useLogoUrl();
  return (
    <img
      className={`brand-img ${className}`}
      src={src}
      width={width}
      height={height}
      alt={alt}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(FALLBACK_URL)) event.currentTarget.src = FALLBACK_URL;
      }}
    />
  );
}
