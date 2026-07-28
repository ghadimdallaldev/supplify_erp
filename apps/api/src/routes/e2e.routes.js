/**
 * Test-only E2E helpers: reset + seed deterministic data.
 * Only mounted when config.E2E_SECRET is set. Protected by X-E2E-Secret header.
 */
import express from 'express'
import { withTransaction } from '../lib/db.js'
import { config } from '../config/env.js'

const router = express.Router()

const E2E_RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440002'
const E2E_SUPPLIER_ID = '550e8400-e29b-41d4-a716-446655440001'
const E2E_BRANCH_ID = '770e8400-e29b-41d4-a716-4466554400aa'
const E2E_ORDER_ID = 'e2e00001-0001-4001-8001-000000000001'
const E2E_ORDER_ITEM_ID = 'e2e00001-0001-4001-8001-000000000002'

const SCENARIOS = [
  'orders_basic',
  'catalog_basic',
  'subscription_limits_basic',
  'orders_delivered',
  'unlock_tenants',
]

function requireE2ESecret(req, res, next) {
  const secret = req.headers['x-e2e-secret']
  if (!config.E2E_SECRET || secret !== config.E2E_SECRET) {
    return res.status(404).json({ ok: false, error: { name: 'NOT_FOUND', message: 'Not found' } })
  }
  next()
}

router.use(requireE2ESecret)

async function resolveBranchId(client, restaurantId) {
  const { rows } = await client.query(
    `SELECT id FROM branch
     WHERE (restaurant_id = $1 OR tenant_id = $1) AND COALESCE(is_active, true) = true
     ORDER BY created_at NULLS LAST
     LIMIT 1`,
    [restaurantId]
  )
  if (rows[0]?.id) return rows[0].id
  return restaurantId === E2E_RESTAURANT_ID ? E2E_BRANCH_ID : null
}

async function resolveSupplierProduct(client, preferredSupplierId) {
  const preferred = preferredSupplierId || E2E_SUPPLIER_ID
  let { rows } = await client.query(
    `SELECT p.id, p.supplier_id
     FROM product p
     WHERE p.supplier_id = $1
     LIMIT 1`,
    [preferred]
  )
  if (rows.length === 0) {
    ;({ rows } = await client.query(
      `SELECT p.id, p.supplier_id FROM product p ORDER BY p.created_at DESC NULLS LAST LIMIT 1`
    ))
  }
  return rows[0] || null
}

/**
 * POST /api/e2e/reset-seed
 * Body: {
 *   scenario: 'orders_basic' | 'catalog_basic' | 'subscription_limits_basic' | 'orders_delivered' | 'unlock_tenants',
 *   orgId?: string,
 *   supplierId?: string,
 *   tenantIds?: string[]
 * }
 */
router.post('/reset-seed', async (req, res) => {
  const scenario = req.body?.scenario
  const restaurantId = req.body?.orgId || E2E_RESTAURANT_ID
  const supplierId = req.body?.supplierId || E2E_SUPPLIER_ID
  const tenantIds = Array.isArray(req.body?.tenantIds) ? req.body.tenantIds.filter(Boolean) : []

  if (!SCENARIOS.includes(scenario)) {
    return res.status(400).json({
      ok: false,
      error: { name: 'VALIDATION_ERROR', message: 'Invalid scenario' },
    })
  }

  try {
    await withTransaction(async (client) => {
      if (scenario === 'unlock_tenants') {
        const ids = tenantIds.length ? tenantIds : [restaurantId, supplierId].filter(Boolean)
        await client.query(
          `UPDATE subscription
           SET account_locked_at = NULL,
               lock_reason = NULL,
               free_sandbox_expires_at = GREATEST(
                 COALESCE(free_sandbox_expires_at, now()),
                 now()
               ) + interval '30 days',
               current_period_end = GREATEST(
                 COALESCE(current_period_end, now()),
                 now()
               ) + interval '30 days',
               updated_at = now()
           WHERE tenant_id = ANY($1::uuid[])`,
          [ids]
        )
        return
      }

      // Ensure default E2E supplier/restaurant/branch exist for local deterministic IDs
      await client.query(
        `INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json)
         VALUES ($1, 'E2E Supplier', 'e2e-supplier', NULL, 'e2e-supplier@test.supplify.com', NULL, '{}')
         ON CONFLICT (id) DO NOTHING`,
        [E2E_SUPPLIER_ID]
      )
      await client.query(
        `INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json)
         VALUES ($1, 'E2E Restaurant', 'e2e-restaurant', NULL, 'e2e-restaurant@test.supplify.com', NULL, '{}')
         ON CONFLICT (id) DO NOTHING`,
        [E2E_RESTAURANT_ID]
      )
      const { rows: branchCols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'branch'
           AND column_name IN ('restaurant_id', 'tenant_id', 'code')`
      )
      const hasRestaurantId = branchCols.some((r) => r.column_name === 'restaurant_id')
      const hasTenantId = branchCols.some((r) => r.column_name === 'tenant_id')
      const hasCode = branchCols.some((r) => r.column_name === 'code')
      if (hasRestaurantId && hasTenantId) {
        await client.query(
          hasCode
            ? `INSERT INTO branch (id, restaurant_id, tenant_id, name, code, is_active)
               VALUES ($1, $2, $2, 'E2E Branch', 'E2E1', true) ON CONFLICT (id) DO NOTHING`
            : `INSERT INTO branch (id, restaurant_id, tenant_id, name, is_active)
               VALUES ($1, $2, $2, 'E2E Branch', true) ON CONFLICT (id) DO NOTHING`,
          [E2E_BRANCH_ID, E2E_RESTAURANT_ID]
        )
      } else if (hasTenantId) {
        await client.query(
          hasCode
            ? `INSERT INTO branch (id, tenant_id, name, code, is_active)
               VALUES ($1, $2, 'E2E Branch', 'E2E1', true) ON CONFLICT (id) DO NOTHING`
            : `INSERT INTO branch (id, tenant_id, name, is_active)
               VALUES ($1, $2, 'E2E Branch', true) ON CONFLICT (id) DO NOTHING`,
          [E2E_BRANCH_ID, E2E_RESTAURANT_ID]
        )
      } else if (hasRestaurantId) {
        await client.query(
          `INSERT INTO branch (id, restaurant_id, name, is_active)
           VALUES ($1, $2, 'E2E Branch', true) ON CONFLICT (id) DO NOTHING`,
          [E2E_BRANCH_ID, E2E_RESTAURANT_ID]
        )
      }

      const branchId = (await resolveBranchId(client, restaurantId)) || E2E_BRANCH_ID

      if (scenario === 'orders_basic' || scenario === 'orders_delivered') {
        await client.query('DELETE FROM order_item WHERE order_id = $1', [E2E_ORDER_ID])
        await client.query('DELETE FROM customer_order WHERE id = $1', [E2E_ORDER_ID])
        await client.query('DELETE FROM customer_order WHERE restaurant_id = $1', [restaurantId])
        const product = await resolveSupplierProduct(client, supplierId)
        if (product) {
          const { rows: priceRow } = await client.query(
            `SELECT amount FROM price
             WHERE product_id = $1 AND valid_to IS NULL
             ORDER BY valid_from DESC LIMIT 1`,
            [product.id]
          )
          const unitPrice = priceRow[0] ? Number(priceRow[0].amount) : 10
          const qty = 2
          const lineTotal = unitPrice * qty
          const status = scenario === 'orders_delivered' ? 'DELIVERED' : 'PLACED'
          await client.query(
            `INSERT INTO customer_order (id, restaurant_id, currency, status, total_amount, placed_at, branch_id)
             VALUES ($1, $2, 'USD', $3, $4, now(), $5)
             ON CONFLICT (id) DO UPDATE SET
               restaurant_id = EXCLUDED.restaurant_id,
               status = EXCLUDED.status,
               total_amount = EXCLUDED.total_amount,
               placed_at = EXCLUDED.placed_at,
               branch_id = EXCLUDED.branch_id`,
            [E2E_ORDER_ID, restaurantId, status, lineTotal, branchId]
          )
          await client.query(
            `INSERT INTO order_item (id, order_id, product_id, supplier_id, quantity, unit_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               order_id = EXCLUDED.order_id,
               product_id = EXCLUDED.product_id,
               supplier_id = EXCLUDED.supplier_id,
               quantity = EXCLUDED.quantity,
               unit_price = EXCLUDED.unit_price,
               line_total = EXCLUDED.line_total`,
            [
              E2E_ORDER_ITEM_ID,
              E2E_ORDER_ID,
              product.id,
              product.supplier_id,
              qty,
              unitPrice,
              lineTotal,
            ]
          )
        }
      }

      if (scenario === 'catalog_basic') {
        const { rows: existing } = await client.query(
          'SELECT 1 FROM product WHERE supplier_id = $1 LIMIT 1',
          [supplierId]
        )
        if (existing.length === 0) {
          const { rows: prod } = await client.query(
            `INSERT INTO product (id, supplier_id, sku, name, unit)
             VALUES (gen_random_uuid(), $1, 'E2E-SKU-1', 'E2E Catalog Product', 'kg')
             RETURNING id`,
            [supplierId]
          )
          if (prod.length > 0) {
            await client.query(
              `INSERT INTO price (product_id, currency, amount, min_qty, valid_from)
               VALUES ($1, $2, $3, 1, now())`,
              [prod[0].id, 'USD', 5.99]
            )
            await client.query(
              `INSERT INTO inventory (product_id, available_qty, updated_at)
               VALUES ($1, 100, now())
               ON CONFLICT (product_id) DO UPDATE SET available_qty = 100`,
              [prod[0].id]
            )
          }
        }
      }

      if (scenario === 'subscription_limits_basic') {
        await client.query(
          `UPDATE usage_meter
           SET current_value = COALESCE(limit_value, 999), last_updated = now()
           WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND meter_type = 'orders_per_day'
             AND period_start_date = CURRENT_DATE`,
          [restaurantId]
        )
      }
    })

    return res.json({ ok: true, scenario })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: { name: 'INTERNAL_ERROR', message: err.message },
    })
  }
})

export const e2eRoutes = router
