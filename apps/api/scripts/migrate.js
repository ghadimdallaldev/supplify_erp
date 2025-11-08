import { pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import { ensureReservationsSchema, ensureStaffAppSchema } from '../src/lib/migrator.js';

async function runMigrations() {
  try {
    await ensureReservationsSchema();
    await ensureStaffAppSchema();
    logger.info('Reservations and staff schemas ensured successfully');
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
