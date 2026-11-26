/**
 * Raw-SQL fixtures for the marketplace harness. Every created tenant gets a real app_user with
 * the system Owner role, so HTTP tests authenticate with `x-test-user: <userSub>`.
 */
import './env.js'
import { randomUUID } from 'node:crypto'

const short = () => randomUUID().slice(0, 8)

async function createTenantUser(pool, { tenantId, tenantType, label }) {
  const sub = `test-${tenantType.toLowerCase()}-${randomUUID()}`
  const email = `${label}-${short()}@marketplace.test`
  const {
    rows: [user],
  } = await pool.query(
    `INSERT INTO app_user (keycloak_sub, email, display_name, role) VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [sub, email, label, tenantType]
  )
  const { assignOwnerRoleForUser } = await import('../../../apps/api/src/lib/tenant-roles.js')
  await assignOwnerRoleForUser(user.id, tenantId, tenantType)
  return { userId: user.id, userSub: sub, email }
}

/**
 * @returns {Promise<{ orgId: string, branchIds: string[], users: Array<{ userId, userSub, email }>, name: string }>}
 *   users[i] is an Owner of branchIds[i] only (branch-scoped access).
 */
export async function createSupplierOrg(
  pool,
  { branches = 1, publicCatalog = true, name = `Supplier ${short()}` } = {}
) {
  const {
    rows: [org],
  } = await pool.query(
    `INSERT INTO supplier_organizations (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, `org-${randomUUID()}`]
  )
  const branchIds = []
  const users = []
  for (let i = 0; i < branches; i++) {
    const {
      rows: [s],
    } = await pool.query(
      `INSERT INTO supplier (name, slug, organization_id, is_main_branch, public_catalog_enabled,
                             contact_email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        i === 0 ? name : `${name} branch ${i + 1}`,
        `sup-${randomUUID()}`,
        org.id,
        i === 0,
        publicCatalog,
        `branch${i}-${short()}@marketplace.test`,
      ]
    )
    branchIds.push(s.id)
    users.push(
      await createTenantUser(pool, { tenantId: s.id, tenantType: 'SUPPLIER', label: `sup${i}` })
    )
  }
  return { orgId: org.id, branchIds, users, name }
}

/** A supplier row with no organisation (legacy shape) — for migration tests. */
export async function createOrglessSupplier(pool, { name = `Legacy ${short()}` } = {}) {
  const {
    rows: [s],
  } = await pool.query(
    `INSERT INTO supplier (name, slug, is_main_branch) VALUES ($1, $2, true) RETURNING id`,
    [name, `legacy-${randomUUID()}`]
  )
  return { id: s.id, name }
}

/** @returns {Promise<{ id: string, name: string, userId: string, userSub: string }>} */
export async function createRestaurant(pool, { name = `Restaurant ${short()}` } = {}) {
  const {
    rows: [r],
  } = await pool.query(
    `INSERT INTO restaurant (name, slug, is_main_branch, contact_email) VALUES ($1, $2, true, $3)
     RETURNING id`,
    [name, `rest-${randomUUID()}`, `owner-${short()}@marketplace.test`]
  )
  const user = await createTenantUser(pool, {
    tenantId: r.id,
    tenantType: 'RESTAURANT',
    label: 'rest',
  })
  return { id: r.id, name, ...user }
}

export async function createProduct(pool, supplierId, overrides = {}) {
  const {
    sku = `SKU-${randomUUID()}`,
    name = `Product ${short()}`,
    price = 10,
    stock = 50,
    categoryId = null,
    category = null,
  } = overrides
  const {
    rows: [p],
  } = await pool.query(
    `INSERT INTO product (supplier_id, sku, name, category_id, category, unit)
     VALUES ($1, $2, $3, $4, $5, 'kg') RETURNING id`,
    [supplierId, sku, name, categoryId, category]
  )
  await pool.query(
    `INSERT INTO price (product_id, currency, amount, min_qty, valid_from)
     VALUES ($1, 'USD', $2, 1, now() - interval '1 day')`,
    [p.id, price]
  )
  await pool.query('UPDATE inventory SET available_qty = $2 WHERE product_id = $1', [p.id, stock])
  return { id: p.id, name, sku }
}

async function mainBranchOf(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id FROM supplier WHERE organization_id = $1 ORDER BY is_main_branch DESC, created_at
     LIMIT 1`,
    [orgId]
  )
  if (!rows[0]) throw new Error(`No supplier branch for org ${orgId}`)
  return rows[0].id
}

async function relationshipColumns(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  )
  return new Set(rows.map((r) => r.column_name))
}

/** Restaurant follows a supplier organisation (written at org level once supported). */
export async function follow(pool, restaurantId, orgId, { supplierId = null } = {}) {
  const branchId = supplierId || (await mainBranchOf(pool, orgId))
  const cols = await relationshipColumns(pool, 'supplier_follow')
  if (cols.has('supplier_org_id')) {
    await pool.query(
      `INSERT INTO supplier_follow (restaurant_id, supplier_id, supplier_org_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [restaurantId, branchId, orgId]
    )
  } else {
    await pool.query(
      `INSERT INTO supplier_follow (restaurant_id, supplier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [restaurantId, branchId]
    )
  }
}

export async function block(pool, restaurantId, orgId, { supplierId = null } = {}) {
  const branchId = supplierId || (await mainBranchOf(pool, orgId))
  const cols = await relationshipColumns(pool, 'supplier_blocklist')
  if (cols.has('supplier_org_id')) {
    await pool.query(
      `DELETE FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2`,
      [restaurantId, orgId]
    )
    await pool.query(
      `INSERT INTO supplier_blocklist (restaurant_id, supplier_id, supplier_org_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [restaurantId, branchId, orgId]
    )
  } else {
    await pool.query(
      `INSERT INTO supplier_blocklist (restaurant_id, supplier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [restaurantId, branchId]
    )
  }
}

/** An order with one line from `supplierId`. Creates a product when none is given. */
export async function createOrder(
  pool,
  { restaurantId, supplierId, status = 'PLACED', productId = null, quantity = 1, price = 10 }
) {
  const product = productId ? { id: productId } : await createProduct(pool, supplierId)
  const {
    rows: [o],
  } = await pool.query(
    `INSERT INTO customer_order (restaurant_id, status, total_amount, subtotal_amount, currency,
                                 supplier_organization_id)
     VALUES ($1, $2::order_status, $3, $3, 'USD',
             (SELECT organization_id FROM supplier WHERE id = $4))
     RETURNING id`,
    [restaurantId, status, quantity * price, supplierId]
  )
  await pool.query(
    `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [o.id, product.id, supplierId, quantity, price, quantity * price]
  )
  return { id: o.id, productId: product.id }
}

export async function createConversation(pool, restaurantId, supplierId) {
  const {
    rows: [c],
  } = await pool.query(
    `INSERT INTO conversation (supplier_id, restaurant_id) VALUES ($1, $2) RETURNING id`,
    [supplierId, restaurantId]
  )
  await pool.query(
    `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
     VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)`,
    [c.id, supplierId, restaurantId]
  )
  return { id: c.id }
}
