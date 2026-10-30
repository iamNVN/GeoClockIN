import { Router } from 'express';
import { audit } from '../../audit.js';
import { query } from '../../db.js';
import { saveSettings, storableSettings } from '../../settings.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(`SELECT updated_at, updated_by FROM settings WHERE key = 'organization'`);
  res.json({
    settings: storableSettings(req.settings),
    updatedAt: rows[0]?.updated_at ?? null,
    updatedBy: rows[0]?.updated_by ?? null,
  });
});

/** Top-level sections whose values differ, for the audit log. */
function changedSections(before, after) {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

router.put('/', async (req, res) => {
  const before = storableSettings(req.settings);
  const saved = storableSettings(await saveSettings(req.body?.settings ?? req.body ?? {}, req.admin.email));
  await audit(null, req.admin, 'settings.update', 'settings', 'organization', {
    sections: changedSections(before, saved),
    before,
    after: saved,
  });
  res.json({ settings: saved, updatedAt: new Date().toISOString(), updatedBy: req.admin.email });
});

export default router;
