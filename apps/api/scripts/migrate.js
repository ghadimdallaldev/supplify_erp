import { pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import { ensureReservationsSchema } from '../src/lib/migrator.js';

async function runMigrations() {
  try {
    await ensureReservationsSchema();
    logger.info('Reservations schema ensured successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
