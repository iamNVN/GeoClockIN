import { HttpError } from '../errors.js';

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in meters between two { latitude, longitude } points. */
export function distanceMeters(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Validates the `{ latitude, longitude, accuracy }` body sent with attendance actions. */
export function parseCoordinates(body) {
  const { latitude, longitude, accuracy } = body ?? {};
  const valid =
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180 &&
    Number.isFinite(accuracy) &&
    accuracy >= 0;
  if (!valid) {
    throw new HttpError(400, 'INVALID_COORDINATES', 'Location data is missing or invalid. Please try again.');
  }
  return { latitude, longitude, accuracy };
}

/**
 * Accuracy policy: a reading is accepted only when its distance from the office
 * is within the geofence radius AND its reported accuracy is within
 * `maxAccuracyMeters`. When even the nearest edge of the accuracy circle lies
 * outside the radius, the result is "outside" rather than "poor accuracy",
 * because a more precise reading would not change the outcome.
 */
export function verifyLocation(coords, office, maxAccuracyMeters) {
  const distance = distanceMeters(coords, office);
  const result = {
    distanceM: Math.round(distance),
    accuracyM: Math.round(coords.accuracy),
    radiusM: office.radiusMeters,
    maxAccuracyM: maxAccuracyMeters,
  };

  const outside = {
    ...result,
    ok: false,
    code: 'OUTSIDE_RADIUS',
    message: `You are ${formatDistance(distance)} from the office. Move within ${office.radiusMeters} m of the office to continue.`,
  };

  if (distance - coords.accuracy > office.radiusMeters) return outside;
  if (coords.accuracy > maxAccuracyMeters) {
    return {
      ...result,
      ok: false,
      code: 'POOR_ACCURACY',
      message: `Your location is only accurate to ±${result.accuracyM} m (±${maxAccuracyMeters} m needed). Turn on precise location, move near a window or open area, and try again.`,
    };
  }
  if (distance > office.radiusMeters) return outside;

  return { ...result, ok: true, code: 'VERIFIED', message: 'You are within the office premises.' };
}
