export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

const MESSAGES = {
  PERMISSION_DENIED:
    'Location access is blocked. Allow location for this site in your browser settings, then try again.',
  POSITION_UNAVAILABLE:
    "We couldn't find your location. Turn on location services (GPS) on your device and try again.",
  TIMEOUT: 'Finding your location took too long. Move near a window or an open area and try again.',
  INSECURE_CONTEXT: 'Location only works over a secure (https://) connection.',
  UNSUPPORTED: "This browser doesn't support location services. Try a recent version of Chrome or Safari.",
};

const ERROR_CODES = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };

/** One-off, high-accuracy position read. Resolves to { latitude, longitude, accuracy, acquiredAt }. */
export function getCurrentPosition({ maximumAge = 0, timeout = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new LocationError('INSECURE_CONTEXT', MESSAGES.INSECURE_CONTEXT));
      return;
    }
    if (!('geolocation' in navigator)) {
      reject(new LocationError('UNSUPPORTED', MESSAGES.UNSUPPORTED));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          acquiredAt: Date.now(),
        }),
      (error) => {
        const code = ERROR_CODES[error.code] ?? 'POSITION_UNAVAILABLE';
        reject(new LocationError(code, MESSAGES[code]));
      },
      { enableHighAccuracy: true, timeout, maximumAge },
    );
  });
}

/** 'granted' | 'denied' | 'prompt' | 'unknown' — without prompting the user. */
export async function locationPermission() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The body the API expects for attendance actions. */
export const toCoordinates = ({ latitude, longitude, accuracy }) => ({ latitude, longitude, accuracy });
