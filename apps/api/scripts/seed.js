import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, '..', 'db', 'seed', 'seed.sql');

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');

    // Read seed file
    const seedSQL = readFileSync(SEED_FILE, 'utf8');
    
    // Execute seed script
    await query(seedSQL);
    
    logger.info('Database seeded successfully');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}
