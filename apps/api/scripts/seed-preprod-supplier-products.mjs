import pg from 'pg'
import { randomUUID } from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const CATEGORIES = [
  { key: 'produce', label: 'Fresh Produce', unit: 'kg' },
  { key: 'dairy', label: 'Dairy', unit: 'case' },
  { key: 'meat', label: 'Meat & Poultry', unit: 'kg' },
  { key: 'seafood', label: 'Seafood', unit: 'kg' },
  { key: 'dry', label: 'Dry Goods', unit: 'case' },
  { key: 'beverage', label: 'Beverages', unit: 'case' },
  { key: 'frozen', label: 'Frozen', unit: 'case' },
  { key: 'packaging', label: 'Packaging', unit: 'pack' },
  { key: 'cleaning', label: 'Cleaning', unit: 'each' },
  { key: 'bakery', label: 'Bakery', unit: 'kg' },
]

const NAMES = [
  'Roma Tomatoes',
  'Baby Spinach',
  'Yellow Onions',
  'Garlic Bulbs',
  'Lemons',
  'Limes',
  'Cucumbers',
  'Bell Peppers',
  'Whole Milk',
  'Heavy Cream',
  'Unsalted Butter',
  'Cheddar Blocks',
  'Mozzarella',
  'Greek Yogurt',
  'Chicken Breast',
  'Ground Beef',
  'Lamb Shoulder',
  'Turkey Slices',
  'Salmon Fillet',
  'Shrimp 16/20',
  'Cod Loins',
  'Tuna Steaks',
  'Basmati Rice',
  'Pasta Penne',
  'Olive Oil Extra Virgin',
  'All Purpose Flour',
  'White Sugar',
  'Sea Salt',
  'Black Pepper',
  'Cola Syrup',
  'Orange Juice',
  'Still Water',
  'Sparkling Water',
  'Frozen Peas',
  'Frozen Berries',
  'Ice Cream Mix',
  'Takeaway Boxes',
  'Napkins',
  'Gloves Nitrile',
  'Dish Soap',
  'Sanitizer',
  'Floor Cleaner',
  'Burger Buns',
  'Sourdough Loaves',
  'Pita Bread',
  'Croissants',
]

function priceFor(categoryKey, i) {
  const base = {
    produce: 2.4,
    dairy: 8.5,
    meat: 14.2,
    seafood: 18.75,
    dry: 6.1,
    beverage: 9.4,
    frozen: 7.8,
    packaging: 3.2,
    cleaning: 4.5,
    bakery: 5.6,
  }[categoryKey]
  return Number((base + (i % 17) * 0.35).toFixed(2))
}

function productImageUrl(sku) {
  return `https://picsum.photos/seed/${encodeURIComponent(sku)}/400/400`
}

async function ensureWarehouse(client, supplierId, supplierName) {
  const existing = await client.query(
    `SELECT id FROM warehouse WHERE supplier_id = $1 ORDER BY is_main DESC NULLS LAST, created_at ASC NULLS LAST LIMIT 1`,
    [supplierId]
  )
  if (existing.rows[0]?.id) return existing.rows[0].id

  const id = randomUUID()
  await client.query(
    `INSERT INTO warehouse (id, supplier_id, tenant_id, name, code, address_json, is_main, is_active, created_at, updated_at)
     VALUES ($1, $2, $2, $3, 'MAIN', '{}'::jsonb, true, true, now(), now())`,
    [id, supplierId, `${supplierName} Main Warehouse`]
  )
  return id
}

async function ensureCatalog(client, supplierId, supplierName) {
  const existing = await client.query(
    `SELECT id FROM catalog WHERE supplier_id = $1 ORDER BY created_at ASC NULLS LAST LIMIT 1`,
    [supplierId]
  )
  if (existing.rows[0]) return
  await client.query(`INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`, [
    supplierId,
    `${supplierName} Catalog`,
  ])
}

async function addProducts(client, supplier, count) {
  await ensureCatalog(client, supplier.id, supplier.name)
  const warehouseId = await ensureWarehouse(client, supplier.id, supplier.name)
  const before = await client.query(`SELECT COUNT(*)::int AS c FROM product WHERE supplier_id = $1`, [
    supplier.id,
  ])
  const startIndex = before.rows[0].c
  let inserted = 0

  for (let i = 0; i < count; i++) {
    const n = startIndex + i + 1
    const category = CATEGORIES[i % CATEGORIES.length]
    const baseName = NAMES[i % NAMES.length]
    const name = `${baseName} ${String(n).padStart(3, '0')}`
    const sku = `${supplier.slug.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, '')}-P${String(n).padStart(4, '0')}`
    const productId = randomUUID()
    const amount = priceFor(category.key, i)
    const qty = 40 + ((i * 7) % 180)

    await client.query(
      `INSERT INTO product (id, supplier_id, sku, name, description, category, unit, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [
        productId,
        supplier.id,
        sku,
        name,
        `${category.label} demo SKU for preprod testing (${supplier.name}).`,
        category.label,
        category.unit,
        productImageUrl(sku),
      ]
    )
    await client.query(
      `INSERT INTO price (product_id, currency, amount, valid_from) VALUES ($1, 'USD', $2, now())`,
      [productId, amount]
    )
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (product_id) DO UPDATE SET warehouse_id = $2, available_qty = $3, updated_at = now()`,
      [productId, warehouseId, qty]
    )
    // Authoritative stock for warehouse-enabled suppliers is warehouse_inventory.
    await client.query(
      `INSERT INTO warehouse_inventory (
         warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
       ) VALUES ($1, $2, $3, 0, $3, now())
       ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
         quantity_available = EXCLUDED.quantity_available,
         quantity_reserved = EXCLUDED.quantity_reserved,
         quantity_on_hand = EXCLUDED.quantity_on_hand,
         updated_at = now()`,
      [warehouseId, productId, qty]
    )
    inserted += 1
    if (inserted % 50 === 0) {
      console.log(`  … ${supplier.slug}: ${inserted}/${count}`)
    }
  }

  const after = await client.query(`SELECT COUNT(*)::int AS c FROM product WHERE supplier_id = $1`, [
    supplier.id,
  ])
  return { inserted, total: after.rows[0].c }
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

try {
  const { rows: suppliers } = await client.query(`
    SELECT id, name, slug, contact_email,
      (SELECT COUNT(*)::int FROM product p WHERE p.supplier_id = supplier.id) AS product_count
    FROM supplier
    ORDER BY name
  `)

  if (suppliers.length < 2) {
    throw new Error(`Need at least 2 suppliers on preprod; found ${suppliers.length}`)
  }

  // Prefer the clearly named supplier for the large catalog.
  const bySlug = Object.fromEntries(suppliers.map((s) => [s.slug, s]))
  const large =
    bySlug['ghadi-preprod-supplier'] ||
    [...suppliers].sort((a, b) => a.product_count - b.product_count)[0]
  const small =
    suppliers.find((s) => s.id !== large.id) ||
    [...suppliers].sort((a, b) => a.product_count - b.product_count)[1]

  console.log(`Adding 50 products → ${small.name} (${small.slug}) [now ${small.product_count}]`)
  console.log(`Adding 500 products → ${large.name} (${large.slug}) [now ${large.product_count}]`)

  await client.query('BEGIN')
  const smallResult = await addProducts(client, small, 50)
  const largeResult = await addProducts(client, large, 500)
  await client.query('COMMIT')

  console.log(
    JSON.stringify(
      {
        ok: true,
        small: { supplier: small.slug, ...smallResult },
        large: { supplier: large.slug, ...largeResult },
      },
      null,
      2
    )
  )
} catch (err) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // ignore
  }
  console.error(err)
  process.exitCode = 1
} finally {
  await client.end()
}
