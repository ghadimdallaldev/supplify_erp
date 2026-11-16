import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import express from '../../apps/api/node_modules/express/index.js'
import request from '../../apps/api/node_modules/supertest/index.js'

vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', CRONS_ENABLED: false, EMAIL_ENABLED: false },
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated audit database')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  globalThis.__auditPool = pool
  const withTransaction = async (fn) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return {
    pool,
    query: (sql, params) => pool.query(sql, params),
    withTransaction,
    migrationQuery: (sql, params) => pool.query(sql, params),
  }
})
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: vi.fn(async (key) =>
    /^(roles:|perms:|tctx:|tenant:req:|user:sub:)/.test(key) ? ['STALE_OWNER_ALLOW'] : null
  ),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../apps/api/src/lib/auth.js', () => ({
  verifyToken: async (token) => ({
    sub: token,
    email: `${token}@audit.invalid`,
    email_verified: true,
    realm_access: { roles: ['supplier'] },
  }),
  getAccessTokenExpiresAtMs: () => Date.now() + 60000,
  refreshAccessTokenSingleFlight: vi.fn(),
}))
vi.mock('../../apps/api/src/lib/request-subscription.js', () => ({
  resolveRequestBillingSubscription: async () => ({ status: 'ACTIVE' }),
  resolveRequestSubscription: async () => null,
}))
vi.mock('../../apps/api/src/lib/subscription.js', async (original) => ({
  ...(await original()),
  requireFeature: () => (_req, _res, next) => next(),
}))

import { pool, withTransaction } from '../../apps/api/src/lib/db.js'
import { reserveWarehouseStockBatch } from '../../apps/api/src/services/warehouseInventory.js'
import { deactivateSupplierWarehouse } from '../../apps/api/src/services/warehouse-lifecycle.service.js'
import {
  getWarehouseAccess,
  replaceWarehouseAccess,
  enforceWarehouseRequestAccess,
} from '../../apps/api/src/lib/warehouse-access.js'
import { userCanAccessTenant } from '../../apps/api/src/lib/tenant-switch.js'
import { getRolesForUser, getPermissionsForUser } from '../../apps/api/src/lib/permissions.js'
import { userIsOwnerInOrganization } from '../../apps/api/src/lib/rbac-guards.js'
import { bootstrapVerifiedTenantOwner } from '../../apps/api/src/lib/owner-bootstrap.js'
import { getTenantAssignmentForUser } from '../../apps/api/src/lib/workspace-tenant.js'
import { updateWarehouseStock } from '../../apps/api/src/services/warehouse-stock-adjustment.service.js'
import {
  deactivateOrgBranch,
  getOrgRolePermissions,
  userHasOrgBranchAccess,
  listOrgBranchesForUser,
} from '../../apps/api/src/lib/supplier-org.js'
import { getRestaurantOrgRolePermissions } from '../../apps/api/src/lib/restaurant-org.js'
import { getScopedUserNotifications } from '../../apps/api/src/services/notification/scoped-notifications.js'
import { canReceiveTenantEvent } from '../../apps/api/src/lib/tenant-event-access.js'
import warehousesRouter from '../../apps/api/src/routes/warehouses.routes.js'
import { errorHandler } from '../../apps/api/src/middlewares/errorHandler.js'

const tx = (fn) => withTransaction(fn)
afterAll(async () => pool.end())

async function fixture(stock = 5) {
  const ids = Object.fromEntries(
    [
      'supplier',
      'otherSupplier',
      'restaurant',
      'warehouse',
      'destination',
      'foreignWarehouse',
      'product',
      'foreignProduct',
      'user',
      'owner',
      'role',
      'order',
    ].map((k) => [k, randomUUID()])
  )
  for (const id of [ids.supplier, ids.otherSupplier])
    await pool.query(
      'INSERT INTO supplier (id, name, slug) VALUES ($1::uuid, $1::text, $1::text)',
      [id]
    )
  await pool.query(
    'INSERT INTO restaurant (id, name, slug) VALUES ($1::uuid, $1::text, $1::text)',
    [ids.restaurant]
  )
  for (const [id, supplier] of [
    [ids.warehouse, ids.supplier],
    [ids.destination, ids.supplier],
    [ids.foreignWarehouse, ids.otherSupplier],
  ]) {
    await pool.query(
      'INSERT INTO warehouse (id, supplier_id, tenant_id, name, is_active) VALUES ($1::uuid, $2, $2, $1::text, TRUE)',
      [id, supplier]
    )
  }
  for (const [id, supplier] of [
    [ids.product, ids.supplier],
    [ids.foreignProduct, ids.otherSupplier],
  ]) {
    await pool.query(
      'INSERT INTO product (id, supplier_id, sku, name) VALUES ($1::uuid, $2, $1::text, $1::text)',
      [id, supplier]
    )
  }
  await pool.query(
    'INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity_available, quantity_on_hand) VALUES ($1, $2, $3, $3)',
    [ids.warehouse, ids.product, stock]
  )
  for (const id of [ids.user, ids.owner])
    await pool.query(
      "INSERT INTO app_user (id, keycloak_sub, email, role) VALUES ($1::uuid, $1::text, $1::text || '@audit.invalid', 'SUPPLIER')",
      [id]
    )
  await pool.query(
    "INSERT INTO tenant_roles (id, tenant_id, tenant_type, name, is_system) VALUES ($1, $2, 'SUPPLIER', 'Warehouse Manager', TRUE)",
    [ids.role, ids.supplier]
  )
  await pool.query(
    "INSERT INTO tenant_user_roles (user_id, role_id, tenant_id, tenant_type) VALUES ($1, $2, $3, 'SUPPLIER')",
    [ids.user, ids.role, ids.supplier]
  )
  await pool.query(
    "INSERT INTO supplier_warehouse_access (user_id, supplier_id, mode) VALUES ($1, $2, 'all')",
    [ids.owner, ids.supplier]
  )
  return ids
}

async function blockedBy(pid, blocker) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const { rows } = await pool.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [
      pid,
      blocker,
    ])
    if (rows[0].blocked) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected PostgreSQL lock dependency was not observed')
}

describe('real PostgreSQL warehouse and access integrity', () => {
  beforeAll(async () => {
    expect((await pool.query('SELECT version()')).rows[0].version).toContain('PostgreSQL 16')
  })

  it('rejects cross-supplier stock and contradictory warehouse ownership', async () => {
    const f = await fixture()
    await expect(
      pool.query('INSERT INTO warehouse_inventory (warehouse_id, product_id) VALUES ($1, $2)', [
        f.warehouse,
        f.foreignProduct,
      ])
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      pool.query('UPDATE warehouse SET supplier_id = $1 WHERE id = $2', [
        f.otherSupplier,
        f.warehouse,
      ])
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('requires a confirmed owned destination and preserves stock on rejected exits', async () => {
    const f = await fixture()
    await expect(
      tx((c) =>
        deactivateSupplierWarehouse(c, { supplierId: f.supplier, warehouseId: f.warehouse })
      )
    ).rejects.toThrow('Choose a destination')
    await expect(
      tx((c) =>
        deactivateSupplierWarehouse(c, {
          supplierId: f.supplier,
          warehouseId: f.warehouse,
          destinationWarehouseId: f.foreignWarehouse,
          confirmTransfer: true,
        })
      )
    ).rejects.toThrow('Destination must')
    expect(
      Number(
        (
          await pool.query(
            'SELECT quantity_available FROM warehouse_inventory WHERE warehouse_id = $1',
            [f.warehouse]
          )
        ).rows[0].quantity_available
      )
    ).toBe(5)
  })

  it('transfers once, deactivates atomically and makes retries harmless', async () => {
    const f = await fixture()
    const args = {
      supplierId: f.supplier,
      warehouseId: f.warehouse,
      destinationWarehouseId: f.destination,
      confirmTransfer: true,
    }
    await tx((c) => deactivateSupplierWarehouse(c, args))
    await tx((c) => deactivateSupplierWarehouse(c, args))
    const stock = await pool.query(
      'SELECT warehouse_id, quantity_available FROM warehouse_inventory WHERE product_id = $1',
      [f.product]
    )
    expect(stock.rows).toHaveLength(1)
    expect(stock.rows[0].warehouse_id).toBe(f.destination)
    expect(Number(stock.rows[0].quantity_available)).toBe(5)
    await expect(
      tx((c) => reserveWarehouseStockBatch(c, f.warehouse, [{ productId: f.product, quantity: 1 }]))
    ).rejects.toThrow()
  })

  it('allows only one of two concurrent reservations for the final units', async () => {
    const f = await fixture(2)
    const a = await pool.connect(),
      b = await pool.connect()
    try {
      await a.query('BEGIN')
      await b.query('BEGIN')
      await reserveWarehouseStockBatch(a, f.warehouse, [{ productId: f.product, quantity: 2 }])
      const attempt = reserveWarehouseStockBatch(b, f.warehouse, [
        { productId: f.product, quantity: 2 },
      ]).then(
        () => null,
        (e) => e
      )
      await blockedBy(b.processID, a.processID)
      await a.query('COMMIT')
      expect((await attempt).message).toMatch(/Insufficient stock/)
      await b.query('ROLLBACK')
      const row = (
        await pool.query('SELECT * FROM warehouse_inventory WHERE warehouse_id = $1', [f.warehouse])
      ).rows[0]
      expect(Number(row.quantity_available)).toBe(0)
      expect(Number(row.quantity_reserved)).toBe(2)
    } finally {
      await a.query('ROLLBACK')
      await b.query('ROLLBACK')
      a.release()
      b.release()
    }
  })

  it('serializes a stock writer against deactivation and rolls back the losing reservation', async () => {
    const f = await fixture()
    const a = await pool.connect(),
      b = await pool.connect()
    try {
      await a.query('BEGIN')
      await b.query('BEGIN')
      await a.query('SELECT id FROM warehouse WHERE id = $1 FOR UPDATE', [f.warehouse])
      const attempt = reserveWarehouseStockBatch(b, f.warehouse, [
        { productId: f.product, quantity: 1 },
      ]).then(
        () => null,
        (e) => e
      )
      await blockedBy(b.processID, a.processID)
      // No stock-row lock while the writer is blocked: this tests the DB guard directly.
      await a.query('UPDATE warehouse SET is_active = FALSE WHERE id = $1', [f.warehouse])
      await a.query('COMMIT')
      expect(await attempt).toMatchObject({ code: '23514' })
      await b.query('ROLLBACK')
      expect(
        Number(
          (
            await pool.query(
              'SELECT quantity_available FROM warehouse_inventory WHERE warehouse_id = $1',
              [f.warehouse]
            )
          ).rows[0].quantity_available
        )
      ).toBe(5)
    } finally {
      await a.query('ROLLBACK')
      await b.query('ROLLBACK')
      a.release()
      b.release()
    }
  })

  it('denies revoked membership even when a valid tenant role survives', async () => {
    const f = await fixture()
    expect(await userCanAccessTenant(f.user, '', f.supplier, 'SUPPLIER')).toBe(true)
    await pool.query(
      "INSERT INTO user_workspace_membership (user_id, workspace_type, home_tenant_id, status) VALUES ($1, 'SUPPLIER', $2, 'revoked')",
      [f.user, f.supplier]
    )
    expect(await userCanAccessTenant(f.user, '', f.supplier, 'SUPPLIER')).toBe(false)
  })

  it('observes role removal without consulting poisoned authorization caches', async () => {
    const f = await fixture()
    expect(await getRolesForUser(f.user, f.supplier, 'SUPPLIER')).toEqual(['Warehouse Manager'])
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'WAREHOUSES_VIEW')",
      [f.role]
    )
    expect(await getPermissionsForUser(f.user, f.supplier, 'SUPPLIER')).toEqual(['WAREHOUSES_VIEW'])
    await pool.query('DELETE FROM tenant_user_roles WHERE user_id = $1', [f.user])
    expect(await getRolesForUser(f.user, f.supplier, 'SUPPLIER')).toEqual([])
    expect(await getPermissionsForUser(f.user, f.supplier, 'SUPPLIER')).toEqual([])
  })

  it('enforces assigned scope, rejects foreign locations and prevents delegated expansion', async () => {
    const f = await fixture()
    expect(await getWarehouseAccess(f.user, f.supplier)).toEqual({
      mode: 'assigned',
      warehouseIds: [],
    })
    await tx((c) =>
      replaceWarehouseAccess(c, {
        actorId: f.owner,
        userId: f.user,
        supplierId: f.supplier,
        access: { mode: 'assigned', warehouseIds: [f.warehouse] },
      })
    )
    const tenant = { tenantType: 'SUPPLIER', tenantId: f.supplier, roles: [], permissions: [] }
    const req = {
      userData: { id: f.user, role: 'SUPPLIER' },
      method: 'GET',
      originalUrl: '/api/warehouses/' + f.warehouse,
    }
    await expect(enforceWarehouseRequestAccess(req, { ...tenant })).resolves.toBeUndefined()
    await expect(
      enforceWarehouseRequestAccess(
        { ...req, originalUrl: '/api/warehouses/' + f.destination },
        { ...tenant }
      )
    ).rejects.toThrow('broader warehouse access')
    await expect(
      tx((c) =>
        replaceWarehouseAccess(c, {
          actorId: f.user,
          userId: f.user,
          supplierId: f.supplier,
          access: { mode: 'all', warehouseIds: [] },
        })
      )
    ).rejects.toThrow('beyond your own scope')
    await expect(
      tx((c) =>
        replaceWarehouseAccess(c, {
          actorId: f.owner,
          userId: f.user,
          supplierId: f.supplier,
          access: { mode: 'assigned', warehouseIds: [f.foreignWarehouse] },
        })
      )
    ).rejects.toThrow('active warehouses')
  })

  it('does not treat a legacy custom Owner role as organization ownership or label it as an owner', async () => {
    const f = await fixture()
    const org = randomUUID()
    await pool.query('INSERT INTO supplier_organizations (id, name) VALUES ($1::uuid, $1::text)', [
      org,
    ])
    await pool.query('UPDATE supplier SET organization_id = $1 WHERE id = $2', [org, f.supplier])
    await pool.query("UPDATE tenant_roles SET name = 'Owner', is_system = FALSE WHERE id = $1", [
      f.role,
    ])
    expect(await userIsOwnerInOrganization(f.user, org, 'SUPPLIER')).toBe(false)
    expect((await getTenantAssignmentForUser(f.user, 'SUPPLIER')).roleName).toBe('Custom: Owner')
  })

  it('does not bootstrap staff into ownership after a contact-email edit', async () => {
    const f = await fixture()
    await pool.query(
      "UPDATE supplier SET contact_email = $1::text || '@audit.invalid' WHERE id = $2",
      [f.user, f.supplier]
    )
    // A member already exists. A second, unassigned matching contact cannot become owner.
    await pool.query(
      "UPDATE app_user SET email = $1::text || '@contact.invalid' WHERE id = $1::uuid",
      [f.user]
    )
    await pool.query("UPDATE app_user SET email = $1::text || '@audit.invalid' WHERE id = $2", [
      f.user,
      f.owner,
    ])
    expect(await bootstrapVerifiedTenantOwner(f.owner, f.supplier, 'SUPPLIER')).toBe(false)
    expect(await getRolesForUser(f.owner, f.supplier, 'SUPPLIER')).toEqual([])
  })

  it('validates merged partial counts, protects reservations and handles exact decimal sums', async () => {
    const f = await fixture()
    await expect(
      tx((c) =>
        updateWarehouseStock(c, {
          supplierId: f.supplier,
          warehouseId: f.warehouse,
          productId: f.product,
          patch: { quantity_available: 10 },
        })
      )
    ).rejects.toThrow('must not exceed')
    await tx((c) =>
      reserveWarehouseStockBatch(c, f.warehouse, [{ productId: f.product, quantity: 2 }])
    )
    await expect(
      tx((c) =>
        updateWarehouseStock(c, {
          supplierId: f.supplier,
          warehouseId: f.warehouse,
          productId: f.product,
          patch: { quantity_reserved: 0 },
        })
      )
    ).rejects.toThrow('managed by orders')
    await pool.query(
      'UPDATE warehouse_inventory SET quantity_available = 0.1, quantity_reserved = 0.2, quantity_on_hand = 0.3 WHERE warehouse_id = $1',
      [f.warehouse]
    )
    const row = await tx((c) =>
      updateWarehouseStock(c, {
        supplierId: f.supplier,
        warehouseId: f.warehouse,
        productId: f.product,
        patch: { quantity_available: 0.1 },
      })
    )
    expect(Number(row.quantity_on_hand)).toBe(0.3)
  })

  it('rejects direct stock writes that violate on-hand counts', async () => {
    const f = await fixture()
    await expect(
      pool.query('UPDATE warehouse_inventory SET quantity_available = 6 WHERE warehouse_id = $1', [
        f.warehouse,
      ])
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('makes simultaneous deactivation attempts transfer and audit only once', async () => {
    const f = await fixture()
    const args = {
      supplierId: f.supplier,
      warehouseId: f.warehouse,
      destinationWarehouseId: f.destination,
      confirmTransfer: true,
    }
    const results = await Promise.all([
      tx((c) => deactivateSupplierWarehouse(c, args)),
      tx((c) => deactivateSupplierWarehouse(c, args)),
    ])
    expect(results.every((row) => row.is_active === false)).toBe(true)
    expect(
      Number(
        (
          await pool.query(
            'SELECT SUM(quantity_available) AS qty FROM warehouse_inventory WHERE product_id = $1',
            [f.product]
          )
        ).rows[0].qty
      )
    ).toBe(5)
    expect(
      (
        await pool.query(
          "SELECT id FROM audit_logs WHERE action_type = 'warehouse.deactivated' AND target_id = $1",
          [f.warehouse]
        )
      ).rows
    ).toHaveLength(1)
  })

  it('serializes branch deactivation with new order creation', async () => {
    const f = await fixture()
    await pool.query('UPDATE supplier SET is_main_branch = FALSE WHERE id = $1', [f.supplier])
    const a = await pool.connect(),
      b = await pool.connect()
    try {
      await a.query('BEGIN')
      await b.query('BEGIN')
      await a.query('SELECT id FROM supplier WHERE id = $1 FOR UPDATE', [f.supplier])
      const attempt = (async () => {
        const order = await b.query(
          "INSERT INTO customer_order (restaurant_id, status) VALUES ($1, 'PLACED') RETURNING id",
          [f.restaurant]
        )
        await b.query(
          'INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, 1, 1, 1)',
          [order.rows[0].id, f.product, f.supplier]
        )
        return null
      })().catch((e) => e)
      await blockedBy(b.processID, a.processID)
      expect((await deactivateOrgBranch(f.supplier, null, a)).ok).toBe(true)
      await a.query('COMMIT')
      expect(await attempt).toMatchObject({ code: '23514' })
      await b.query('ROLLBACK')
    } finally {
      await a.query('ROLLBACK')
      await b.query('ROLLBACK')
      a.release()
      b.release()
    }
  })

  it('filters notification reads and queued recipients by current tenant and permissions', async () => {
    const f = await fixture()
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'INVOICES_VIEW')",
      [f.role]
    )
    for (const [tenant, type] of [
      [f.supplier, 'INVOICE'],
      [f.otherSupplier, 'INVOICE'],
      [f.supplier, 'ORDER'],
    ]) {
      await pool.query(
        "INSERT INTO notification_log (user_id, user_type, tenant_id, notification_type, notification_category, title, message, reference_type) VALUES ($1, 'SUPPLIER', $2, 'SYSTEM', 'audit', 'audit', 'audit', $3)",
        [f.user, tenant, type]
      )
    }
    const result = await getScopedUserNotifications(f.user, 'SUPPLIER', {
      tenantId: f.supplier,
      permissions: ['INVOICES_VIEW'],
      warehouseAccess: { mode: 'all', warehouseIds: [] },
    })
    expect(result.notifications).toHaveLength(1)
    expect(result.unreadCount).toBe(1)
    await pool.query(
      "INSERT INTO user_workspace_membership (user_id, workspace_type, home_tenant_id, status) VALUES ($1, 'SUPPLIER', $2, 'revoked')",
      [f.user, f.supplier]
    )
    expect(
      await canReceiveTenantEvent({
        userId: f.user,
        tenantId: f.supplier,
        tenantType: 'SUPPLIER',
        referenceType: 'INVOICE',
      })
    ).toBe(false)
  })

  it('evaluates organization branch scope per permission and rejects foreign branch identifiers', async () => {
    const f = await fixture(),
      org = randomUUID(),
      role = randomUUID()
    await pool.query('INSERT INTO supplier_organizations (id, name) VALUES ($1::uuid, $1::text)', [
      org,
    ])
    await pool.query('UPDATE supplier SET organization_id = $1 WHERE id = $2', [org, f.supplier])
    await pool.query(
      "INSERT INTO org_roles (id, organization_id, name) VALUES ($1, $2, 'Mixed scope')",
      [role, org]
    )
    await pool.query(
      'INSERT INTO org_user_roles (user_id, organization_id, role_id) VALUES ($1, $2, $3)',
      [f.user, org, role]
    )
    await pool.query(
      "INSERT INTO org_role_permissions (role_id, permission, branch_scope) VALUES ($1, 'ORDERS_VIEW', 'all'), ($1, 'INVENTORY_EDIT', 'assigned')",
      [role]
    )
    expect(await getOrgRolePermissions(f.user, org, f.supplier)).toEqual(['ORDERS_VIEW'])
    expect(await getOrgRolePermissions(f.user, org, null)).toEqual(['ORDERS_VIEW'])
    expect(await getOrgRolePermissions(f.user, org, f.otherSupplier)).toEqual([])
    await pool.query(
      'INSERT INTO org_user_branch_access (user_id, supplier_id, organization_id) VALUES ($1, $2, $3)',
      [f.user, f.supplier, org]
    )
    expect(new Set(await getOrgRolePermissions(f.user, org, f.supplier))).toEqual(
      new Set(['ORDERS_VIEW', 'INVENTORY_EDIT'])
    )
    await expect(
      pool.query(
        'INSERT INTO org_user_branch_access (user_id, supplier_id, organization_id) VALUES ($1, $2, $3)',
        [f.user, f.otherSupplier, org]
      )
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('does not grant restaurant assigned-scope permissions when the branch context or assignment is missing', async () => {
    const f = await fixture(),
      org = randomUUID(),
      role = randomUUID(),
      user = randomUUID()
    await pool.query(
      "INSERT INTO app_user (id, keycloak_sub, email, role) VALUES ($1::uuid, $1::text, $1::text || '@restaurant.invalid', 'RESTAURANT')",
      [user]
    )
    await pool.query(
      'INSERT INTO restaurant_organizations (id, name) VALUES ($1::uuid, $1::text)',
      [org]
    )
    await pool.query('UPDATE restaurant SET organization_id = $1 WHERE id = $2', [
      org,
      f.restaurant,
    ])
    await pool.query(
      "INSERT INTO restaurant_org_roles (id, organization_id, name) VALUES ($1, $2, 'Assigned custom')",
      [role, org]
    )
    await pool.query(
      'INSERT INTO restaurant_org_user_roles (user_id, organization_id, role_id) VALUES ($1, $2, $3)',
      [user, org, role]
    )
    await pool.query(
      "INSERT INTO restaurant_org_role_permissions (role_id, permission, branch_scope) VALUES ($1, 'ORDERS_VIEW', 'assigned')",
      [role]
    )
    expect(await getRestaurantOrgRolePermissions(user, org, null)).toEqual([])
    expect(await getRestaurantOrgRolePermissions(user, org, f.restaurant)).toEqual([])
    await pool.query(
      'INSERT INTO restaurant_org_user_branch_access (user_id, restaurant_id, organization_id) VALUES ($1, $2, $3)',
      [user, f.restaurant, org]
    )
    expect(await getRestaurantOrgRolePermissions(user, org, f.restaurant)).toEqual(['ORDERS_VIEW'])
  })

  it('denies a pre-existing foreign-tenant role reference rather than trusting its Owner label', async () => {
    const f = await fixture(),
      foreignRole = randomUUID()
    await pool.query(
      "INSERT INTO tenant_roles (id, tenant_id, tenant_type, name, is_system) VALUES ($1, $2, 'SUPPLIER', 'Owner', TRUE)",
      [foreignRole, f.otherSupplier]
    )
    await expect(
      pool.query('UPDATE tenant_user_roles SET role_id = $1 WHERE user_id = $2', [
        foreignRole,
        f.user,
      ])
    ).rejects.toMatchObject({ code: '23514' })
    await tx(async (client) => {
      // Simulate an old corrupt row, solely in the explicitly isolated test database.
      await client.query("SET LOCAL session_replication_role = 'replica'")
      await client.query('UPDATE tenant_user_roles SET role_id = $1 WHERE user_id = $2', [
        foreignRole,
        f.user,
      ])
    })
    expect(await getRolesForUser(f.user, f.supplier, 'SUPPLIER')).toEqual([])
    expect(await getPermissionsForUser(f.user, f.supplier, 'SUPPLIER')).toEqual([])
  })

  it('does not turn an organization role name into access to every branch', async () => {
    const f = await fixture(),
      org = randomUUID(),
      role = randomUUID()
    await pool.query('INSERT INTO supplier_organizations (id, name) VALUES ($1::uuid, $1::text)', [
      org,
    ])
    await pool.query('UPDATE supplier SET organization_id = $1 WHERE id = ANY($2::uuid[])', [
      org,
      [f.supplier, f.otherSupplier],
    ])
    await pool.query(
      "INSERT INTO org_roles (id, organization_id, name, is_system) VALUES ($1, $2, 'Org Owner', FALSE)",
      [role, org]
    )
    await pool.query(
      'INSERT INTO org_user_roles (user_id, organization_id, role_id) VALUES ($1, $2, $3)',
      [f.user, org, role]
    )
    await pool.query(
      "INSERT INTO org_role_permissions (role_id, permission, branch_scope) VALUES ($1, 'ORDERS_VIEW', 'assigned')",
      [role]
    )
    expect(await userHasOrgBranchAccess(f.user, f.otherSupplier, org)).toBe(false)
    expect(await listOrgBranchesForUser(f.user, org)).toEqual([])
    await pool.query(
      'INSERT INTO org_user_branch_access (user_id, supplier_id, organization_id) VALUES ($1, $2, $3)',
      [f.user, f.supplier, org]
    )
    expect(await userHasOrgBranchAccess(f.user, f.supplier, org)).toBe(true)
    expect((await listOrgBranchesForUser(f.user, org)).map((branch) => branch.id)).toEqual([
      f.supplier,
    ])
  })

  it('rejects foreign order events even with tenant-wide access', async () => {
    const f = await fixture()
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'ORDERS_VIEW')",
      [f.role]
    )
    await pool.query(
      "UPDATE supplier_warehouse_access SET mode = 'all' WHERE user_id = $1 AND supplier_id = $2",
      [f.user, f.supplier]
    )
    const { rows } = await pool.query(
      "INSERT INTO customer_order (restaurant_id, status) VALUES ($1, 'PLACED') RETURNING id",
      [f.restaurant]
    )
    await pool.query(
      'INSERT INTO order_item (order_id, supplier_id, product_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, 1, 1, 1)',
      [rows[0].id, f.otherSupplier, f.foreignProduct]
    )
    const context = {
      userId: f.user,
      tenantId: f.supplier,
      tenantType: 'SUPPLIER',
      referenceType: 'ORDER',
      orderId: rows[0].id,
    }
    expect(await canReceiveTenantEvent(context)).toBe(false)
    expect(
      await canReceiveTenantEvent({ ...context, orderId: null, warehouseId: f.foreignWarehouse })
    ).toBe(false)
    await pool.query(
      'UPDATE order_item SET supplier_id = $1, product_id = $2 WHERE order_id = $3',
      [f.supplier, f.product, rows[0].id]
    )
    expect(await canReceiveTenantEvent(context)).toBe(true)
  })
})

describe('real HTTP permission and warehouse isolation with PostgreSQL grants', () => {
  const app = express()
  app.use(express.json())
  app.use('/api/warehouses', warehousesRouter)
  app.use(errorHandler)
  it('requires authentication, filters authorized reads and rejects crafted warehouse IDs', async () => {
    const f = await fixture()
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'WAREHOUSES_VIEW')",
      [f.role]
    )
    await tx((c) =>
      replaceWarehouseAccess(c, {
        actorId: f.owner,
        userId: f.user,
        supplierId: f.supplier,
        access: { mode: 'assigned', warehouseIds: [f.warehouse] },
      })
    )
    await request(app).get('/api/warehouses').expect(401)
    const response = await request(app)
      .get('/api/warehouses')
      .set('Authorization', 'Bearer ' + f.user)
      .expect(200)
    expect(response.body.data.warehouses.map((row) => row.id)).toEqual([f.warehouse])
    await request(app)
      .get(`/api/warehouses/${f.destination}/inventory`)
      .set('Authorization', 'Bearer ' + f.user)
      .expect(403)
    await request(app)
      .get(`/api/warehouses/${f.foreignWarehouse}/inventory`)
      .set('Authorization', 'Bearer ' + f.user)
      .expect(403)
    await request(app)
      .patch(`/api/warehouses/${f.warehouse}`)
      .set('Authorization', 'Bearer ' + f.user)
      .send({ name: 'Unauthorized rename' })
      .expect(403)
    expect(
      (await pool.query('SELECT name FROM warehouse WHERE id = $1', [f.warehouse])).rows[0].name
    ).toBe(f.warehouse)
  })
  it('requires order-view permission independently on warehouse order reads', async () => {
    const f = await fixture()
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'WAREHOUSES_VIEW')",
      [f.role]
    )
    await tx((c) =>
      replaceWarehouseAccess(c, {
        actorId: f.owner,
        userId: f.user,
        supplierId: f.supplier,
        access: { mode: 'assigned', warehouseIds: [f.warehouse] },
      })
    )
    await request(app)
      .get(`/api/warehouses/${f.warehouse}/orders`)
      .set('Authorization', 'Bearer ' + f.user)
      .expect(403)
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'ORDERS_VIEW')",
      [f.role]
    )
    await request(app)
      .get(`/api/warehouses/${f.warehouse}/orders`)
      .set('Authorization', 'Bearer ' + f.user)
      .expect(200)
  })
  it('rejects the same existing token after membership revocation', async () => {
    const f = await fixture()
    await pool.query(
      "INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, 'WAREHOUSES_VIEW')",
      [f.role]
    )
    await tx((c) =>
      replaceWarehouseAccess(c, {
        actorId: f.owner,
        userId: f.user,
        supplierId: f.supplier,
        access: { mode: 'all', warehouseIds: [] },
      })
    )
    await request(app)
      .get('/api/warehouses')
      .set('Authorization', 'Bearer ' + f.user)
      .expect(200)
    await pool.query(
      "INSERT INTO user_workspace_membership (user_id, workspace_type, home_tenant_id, status) VALUES ($1, 'SUPPLIER', $2, 'revoked')",
      [f.user, f.supplier]
    )
    await request(app)
      .get('/api/warehouses')
      .set('Authorization', 'Bearer ' + f.user)
      .expect(403)
  })
})
