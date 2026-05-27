/**
 * Seed quick lists for all restaurants.
 * Run after prodlike seed. Creates 3–6 quick lists per restaurant with items from suppliers.
 *
 * Usage: node scripts/seed-quick-lists.js
 * Optional: SEED=1337 (default) for determinism
 */
import 'dotenv/config'
import pg from 'pg'
import { createSeededRng, intBetween, pick, shuffle } from './seed/seedRng.js'

const SEED = parseInt(process.env.SEED || '1337', 10)
const rng = createSeededRng(SEED)

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
})

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/x/g, () => ((rng() * 16) | 0).toString(16))
    .replace(/y/g, () => ((rng() * 4) | 8).toString(16))
}

const LIST_NAMES = [
  'Weekly staples',
  'Dairy & eggs',
  'Produce order',
  'Dry goods',
  'Beverages',
  'Cleaning supplies',
  'Emergency restock',
  'Monthly bulk',
  'Breakfast items',
  'Dinner prep',
]

const FREQUENCIES = ['WEEKLY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY', null, null]
const DAYS_OF_WEEK = [
  ['MONDAY', 'THURSDAY'],
  ['TUESDAY', 'FRIDAY'],
  ['WEDNESDAY'],
  ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
]

async function main() {
  console.log('🌱 Seeding quick lists for all restaurants (SEED=' + SEED + ')\n')

  const client = await pool.connect()
  try {
    const { rows: restaurants } = await client.query(
      'SELECT id, name FROM restaurant ORDER BY name'
    )
    if (restaurants.length === 0) {
      console.log('No restaurants found. Run seed:prodlike first.')
      process.exit(1)
    }

    const { rows: suppliers } = await client.query('SELECT id, name FROM supplier ORDER BY name')
    if (suppliers.length === 0) {
      console.log('No suppliers found.')
      process.exit(1)
    }

    const { rows: quickListCols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'quick_list'`
    )
    const hasSupplierId = quickListCols.some((c) => c.column_name === 'supplier_id')
    const hasScheduling = quickListCols.some((c) => c.column_name === 'is_scheduled')

    const { rows: productsBySupplier } = await client.query(`
      SELECT p.id, p.supplier_id, p.name
      FROM product p
      ORDER BY p.supplier_id, p.name
    `)
    const productsBySupplierMap = new Map()
    for (const p of productsBySupplier) {
      if (!productsBySupplierMap.has(p.supplier_id)) productsBySupplierMap.set(p.supplier_id, [])
      productsBySupplierMap.get(p.supplier_id).push(p)
    }

    let listCount = 0
    let itemCount = 0

    for (const rest of restaurants) {
      const numLists = intBetween(rng, 3, 6)
      const listNames = shuffle(rng, [...LIST_NAMES]).slice(0, numLists)

      for (let i = 0; i < numLists; i++) {
        const name = listNames[i] || `Quick list ${i + 1}`
        const supplier = pick(rng, suppliers)
        const supplierId = supplier.id
        const products = productsBySupplierMap.get(supplierId) || []
        if (products.length === 0) continue

        const isScheduled = hasScheduling && rng() < 0.6
        const frequency = isScheduled ? pick(rng, FREQUENCIES.filter(Boolean)) : null
        const daysOfWeek = frequency && rng() < 0.7 ? [pick(rng, DAYS_OF_WEEK)] : null
        const status = hasScheduling && rng() < 0.9 ? 'ACTIVE' : 'PAUSED'

        const quickListId = uuid()
        if (hasSupplierId && hasScheduling) {
          await client.query(
            `INSERT INTO quick_list (id, restaurant_id, supplier_id, name, description, is_scheduled, frequency, days_of_week, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
            [
              quickListId,
              rest.id,
              supplierId,
              name,
              `${name} from ${supplier.name}`,
              isScheduled,
              frequency,
              daysOfWeek ? JSON.stringify(daysOfWeek) : null,
              status,
            ]
          )
        } else if (hasSupplierId) {
          await client.query(
            `INSERT INTO quick_list (id, restaurant_id, supplier_id, name, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [quickListId, rest.id, supplierId, name, `${name} from ${supplier.name}`]
          )
        } else {
          await client.query(
            `INSERT INTO quick_list (id, restaurant_id, name, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [quickListId, rest.id, name, `${name} from ${supplier.name}`]
          )
        }
        listCount++

        const numItems = intBetween(rng, 5, Math.min(20, products.length))
        shuffle(rng, products)
        const selected = products.slice(0, numItems)
        for (const p of selected) {
          const qty = intBetween(rng, 1, 10)
          await client.query(
            `INSERT INTO quick_list_item (id, quick_list_id, product_id, supplier_id, quantity, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (quick_list_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
            [uuid(), quickListId, p.id, supplierId, qty]
          )
          itemCount++
        }
      }
    }

    console.log('✅ Quick lists created:', listCount)
    console.log('✅ Quick list items created:', itemCount)
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
