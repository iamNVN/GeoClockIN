import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../src/errors.js';
import { distanceMeters, formatDistance, parseCoordinates, verifyLocation } from '../src/lib/geo.js';

const office = { latitude: 12.9894, longitude: 80.2486, radiusMeters: 150 };
const MAX_ACCURACY = 100;

// ~1.112 m per 0.00001° of latitude.
const north = (meters) => office.latitude + meters / 111_195;

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    assert.equal(distanceMeters(office, office), 0);
  });

  it('measures short distances to within a meter', () => {
    const d = distanceMeters(office, { latitude: north(100), longitude: office.longitude });
    assert.ok(Math.abs(d - 100) < 1, `expected ~100 m, got ${d}`);
  });

  it('matches a known long distance (Chennai → Coimbatore ≈ 425 km)', () => {
    const d = distanceMeters({ latitude: 13.0827, longitude: 80.2707 }, { latitude: 11.0168, longitude: 76.9558 });
    assert.ok(Math.abs(d - 425_000) < 10_000, `got ${d}`);
  });
});

describe('verifyLocation', () => {
  const at = (meters, accuracy) =>
    verifyLocation({ latitude: north(meters), longitude: office.longitude, accuracy }, office, MAX_ACCURACY);

  it('accepts an accurate reading inside the radius', () => {
    const result = at(20, 8);
    assert.equal(result.ok, true);
    assert.equal(result.code, 'VERIFIED');
    assert.equal(result.distanceM, 20);
    assert.equal(result.accuracyM, 8);
  });

  it('accepts a reading exactly on the boundary', () => {
    assert.equal(at(149.5, 5).ok, true);
  });

  it('rejects an accurate reading outside the radius', () => {
    const result = at(160, 20);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'OUTSIDE_RADIUS');
  });

  it('rejects an inaccurate reading inside the radius as poor accuracy', () => {
    const result = at(40, 150);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'POOR_ACCURACY');
  });

  it('reports "outside" when even the accuracy circle cannot reach the office', () => {
    const result = at(1200, 500);
    assert.equal(result.code, 'OUTSIDE_RADIUS');
    assert.match(result.message, /1\.2 km/);
  });
});

describe('parseCoordinates', () => {
  it('accepts valid numeric coordinates', () => {
    assert.deepEqual(parseCoordinates({ latitude: 1, longitude: 2, accuracy: 3, extra: true }), {
      latitude: 1,
      longitude: 2,
      accuracy: 3,
    });
  });

  for (const [label, body] of [
    ['missing body', undefined],
    ['missing accuracy', { latitude: 1, longitude: 2 }],
    ['string values', { latitude: '1', longitude: '2', accuracy: '3' }],
    ['latitude out of range', { latitude: 91, longitude: 2, accuracy: 3 }],
    ['longitude out of range', { latitude: 1, longitude: -181, accuracy: 3 }],
    ['negative accuracy', { latitude: 1, longitude: 2, accuracy: -1 }],
  ]) {
    it(`rejects ${label}`, () => {
      assert.throws(() => parseCoordinates(body), (err) => err instanceof HttpError && err.status === 400);
    });
  }
});

describe('formatDistance', () => {
  it('uses meters below 1 km and kilometers above', () => {
    assert.equal(formatDistance(18.4), '18 m');
    assert.equal(formatDistance(1234), '1.2 km');
    assert.equal(formatDistance(425_000), '425 km');
  });
});
