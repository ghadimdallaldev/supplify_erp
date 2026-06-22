import 'dotenv/config'
import { query, pool } from '../src/lib/db.js'

const all = await query(`SELECT id, slug, name, created_at FROM restaurant WHERE name ILIKE '%marina%' OR slug ILIKE '%marina%' ORDER BY created_at`)
console.log('marina restaurants:', all.rows)
await pool.end()
