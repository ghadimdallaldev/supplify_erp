import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool, query } from '../src/lib/db.js'
import { logger } from '../src/lib/logger.js'
import { isMainModule } from './lib/is-main.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SEED_FILE = join(__dirname, '..', 'db', 'seed', 'seed.sql')

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...')

    // Read seed file
    const seedSQL = readFileSync(SEED_FILE, 'utf8')

    // Execute seed script
    await query(seedSQL)

    logger.info('Database seeded successfully')
  } catch (error) {
    logger.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  seedDatabase()
}
