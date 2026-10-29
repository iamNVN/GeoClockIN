// Creates the database tables. The API also does this automatically on first
// use, so running it is optional — handy for verifying DATABASE_URL.
import { closePool, ensureSchema } from '../src/db.js';

try {
  await ensureSchema();
  console.log('Database schema is up to date.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
