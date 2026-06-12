/**
 * Add sample products for the first supplier in the database (or SUPPLIER_ID env).
 * Usage: node scripts/seed-supplier-products.js
 */
import { query, pool } from '../src/lib/db.js'
import { upsertWarehouseInventoryFromInventory } from '../src/services/supplier-inventory.service.js'

const DEFAULT_PRODUCTS = [
  {
    name: 'Fresh Tomatoes',
    sku: 'GHS-TOM-001',
    category: 'Vegetables',
    unit: 'kg',
    description: 'Vine-ripened tomatoes',
    price: 8.5,
    stock: 500,
  },
  {
    name: 'Extra Virgin Olive Oil',
    sku: 'GHS-OIL-002',
    category: 'Pantry',
    unit: 'L',
    description: 'Cold-pressed olive oil, 1L bottle',
    price: 24.0,
    stock: 200,
  },
  {
    name: 'Chicken Breast (Fresh)',
    sku: 'GHS-CHK-003',
    category: 'Protein',
    unit: 'kg',
    description: 'Boneless skinless chicken breast',
    price: 15.75,
    stock: 300,
  },
]

async function main() {
  const supplierId = process.env.SUPPLIER_ID
  let supplier
  if (supplierId) {
    const { rows } = await query('SELECT id, name FROM supplier WHERE id = $1', [supplierId])
    supplier = rows[0]
  } else {
    const { rows } = await query('SELECT id, name FROM supplier ORDER BY created_at LIMIT 1')
    supplier = rows[0]
  }

  if (!supplier) {
    console.error('No supplier found in the database.')
    process.exit(1)
  }

  const { rows: warehouses } = await query(
    'SELECT id, name FROM warehouse WHERE supplier_id = $1 ORDER BY created_at LIMIT 1',
    [supplier.id]
  )
  const warehouseId = warehouses[0]?.id || null

  console.log(`Adding products for supplier: ${supplier.name} (${supplier.id})`)
  if (warehouseId) {
    console.log(`Warehouse: ${warehouses[0].name} (${warehouseId})`)
  }

  for (const p of DEFAULT_PRODUCTS) {
    const { rows } = await query(
      `INSERT INTO product (supplier_id, sku, name, category, unit, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (supplier_id, sku) DO UPDATE
         SET name = EXCLUDED.name, category = EXCLUDED.category, unit = EXCLUDED.unit,
             description = EXCLUDED.description, updated_at = NOW()
       RETURNING id, sku, name`,
      [supplier.id, p.sku, p.name.trim(), p.category, p.unit, p.description]
    )
    const productId = rows[0].id

    await query(
      `INSERT INTO price (product_id, amount, currency, valid_from) VALUES ($1, $2, 'USD', NOW())`,
      [productId, p.price]
    )

    await query(
      `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
       VALUES ($1, $2, $3, 0, NOW())
       ON CONFLICT (product_id) DO UPDATE
         SET available_qty = EXCLUDED.available_qty,
             warehouse_id = COALESCE(EXCLUDED.warehouse_id, inventory.warehouse_id),
             updated_at = NOW()`,
      [productId, warehouseId, p.stock]
    )

    if (warehouseId) {
      await upsertWarehouseInventoryFromInventory(null, {
        warehouseId,
        productId,
        availableQty: p.stock,
      })
    }

    console.log(
      `  ✓ ${rows[0].name} (${rows[0].sku}) — $${p.price.toFixed(2)}, stock ${p.stock} ${p.unit}`
    )
  }

  console.log('\nDone.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => pool.end())
