import { query } from './db.js';

/** Records an administrative change (who, what, which record, details). */
export async function audit(db, admin, action, entity, entityId, details = null) {
  await (db ?? { query }).query(
    'INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [admin.email, action, entity, entityId, details && JSON.stringify(details)],
  );
}
