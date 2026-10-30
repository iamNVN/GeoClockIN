import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INDIAN_GAZETTED_HOLIDAYS } from '../src/lib/holidayPresets.js';
import { normalizeSettings } from '../src/lib/settingsSchema.js';
import seed from '../config/geoclockin.config.js';
import { weekdayOf } from '../src/lib/time.js';

// Weekdays as printed in the DoPT annexures (0 = Sunday … 6 = Saturday).
const ANNEXURE_WEEKDAYS = {
  2026: [1, 3, 6, 4, 2, 5, 5, 3, 5, 6, 3, 5, 5, 2, 0, 2, 5],
  2027: [2, 3, 2, 5, 4, 1, 1, 4, 3, 0, 3, 6, 6, 5, 0, 6],
};

describe('Indian gazetted holidays', () => {
  for (const [year, holidays] of Object.entries(INDIAN_GAZETTED_HOLIDAYS)) {
    it(`${year}: dates match the weekdays in the DoPT list`, () => {
      assert.deepEqual(
        holidays.map((h) => weekdayOf(h.date)),
        ANNEXURE_WEEKDAYS[year],
      );
      assert.ok(holidays.every((h) => h.date.startsWith(`${year}-`) && h.name));
      assert.deepEqual([...holidays].sort((a, b) => a.date.localeCompare(b.date)), holidays);
    });
  }

  it('are valid settings and seed a new database', () => {
    const s = normalizeSettings(seed);
    assert.equal(s.schedule.holidays.length, 33);
    assert.ok(s.schedule.holidayDates.includes('2026-11-08'));
  });
});
