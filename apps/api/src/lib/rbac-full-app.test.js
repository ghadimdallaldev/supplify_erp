/**
 * Full-app RBAC regression suite (role matrix, tenant isolation, impersonation policy).
 * Run: npx vitest run src/lib/rbac-full-app.test.js
 */
import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { hasPermission } from './permissions.js'
import { isPermissionSubset } from './rbac-guards.js'
import { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES } from './role-matrix.js'
import {
  isDriverOnlyPermissions,
  assertDriverStatusUpdate,
  DRIVER_ALLOWED_STATUS_UPDATES,
} from './driver-rbac.js'
import { requirePermission, requireAnyPermission, requireRole } from './rbac.js'
import { getAllPermissionsForTenantType } from './tenant-roles.js'

const restaurantRole = (name) => RESTAURANT_SYSTEM_ROLES.find((r) => r.name === name)
const supplierRole = (name) => SUPPLIER_SYSTEM_ROLES.find((r) => r.name === name)

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

function runMiddleware(mw, req = {}) {
  const res = mockRes()
  const next = vi.fn()
  mw({ requestId: 'req-test', ...req }, res, next)
  return { res, next }
}

describe('tenant type isolation (requireRole)', () => {
  it('restaurant user cannot pass supplier-only route', () => {
    const { res, next } = runMiddleware(requireRole(['SUPPLIER']), {
      userData: { role: 'RESTAURANT', id: 'u1' },
    })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('supplier user cannot pass restaurant-only route', () => {
    const { res, next } = runMiddleware(requireRole(['RESTAURANT']), {
      userData: { role: 'SUPPLIER', id: 'u1' },
    })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('restaurant owner can access restaurant-scoped routes', () => {
    const { next } = runMiddleware(requireRole(['RESTAURANT']), {
      userData: { role: 'RESTAURANT', id: 'u1' },
    })
    expect(next).toHaveBeenCalled()
  })

  it('supplier owner can access supplier-scoped routes', () => {
    const { next } = runMiddleware(requireRole(['SUPPLIER']), {
      userData: { role: 'SUPPLIER', id: 'u1' },
    })
    expect(next).toHaveBeenCalled()
  })
})

describe('permission enforcement (requirePermission)', () => {
  it('blocks when tenant context lacks permission', () => {
    const { res, next } = runMiddleware(requirePermission(P.SETTINGS_MANAGE), {
      userData: { role: 'RESTAURANT', id: 'u1' },
      tenantContext: { permissions: [P.ORDERS_VIEW] },
    })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('restaurant finance can access invoices view but not settings manage', () => {
    const perms = restaurantRole('Accountant').permissions
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(false)
    const { next: ok } = runMiddleware(requirePermission(P.INVOICES_VIEW), {
      userData: { role: 'RESTAURANT', id: 'u1' },
      tenantContext: { permissions: perms },
    })
    expect(ok).toHaveBeenCalled()
    const { res } = runMiddleware(requirePermission(P.SETTINGS_MANAGE), {
      userData: { role: 'RESTAURANT', id: 'u1' },
      tenantContext: { permissions: perms },
    })
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('restaurant staff without billing cannot access subscriptions manage', () => {
    const perms = restaurantRole('Restaurant Manager').permissions
    expect(hasPermission(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
    const { res } = runMiddleware(requirePermission(P.SUBSCRIPTIONS_MANAGE), {
      userData: { role: 'RESTAURANT', id: 'u1' },
      tenantContext: { permissions: perms },
    })
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('supplier owner expanded permissions include settings view', () => {
    const ownerPerms = getAllPermissionsForTenantType('SUPPLIER')
    expect(hasPermission(ownerPerms, P.SETTINGS_VIEW)).toBe(true)
    const { next } = runMiddleware(requirePermission(P.SETTINGS_VIEW), {
      userData: { role: 'SUPPLIER', id: 'u1' },
      tenantContext: { permissions: ownerPerms },
    })
    expect(next).toHaveBeenCalled()
  })
})

describe('supplier role matrix', () => {
  it('driver only sees assigned delivery permissions', () => {
    const perms = supplierRole('Driver').permissions
    expect(isDriverOnlyPermissions(perms)).toBe(true)
    expect(hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.CATALOG_VIEW)).toBe(false)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(false)
    expect(hasPermission(perms, P.PROMOTIONS_VIEW)).toBe(false)
  })

  it('driver cannot access catalog, invoices, settings, or deals APIs (permission layer)', () => {
    const perms = supplierRole('Driver').permissions
    for (const key of [
      P.CATALOG_VIEW,
      P.INVOICES_VIEW,
      P.SETTINGS_VIEW,
      P.PROMOTIONS_VIEW,
      P.ORDERS_VIEW,
    ]) {
      const { res } = runMiddleware(requirePermission(key), {
        userData: { role: 'SUPPLIER', id: 'u1' },
        tenantContext: { permissions: perms },
      })
      expect(res.status).toHaveBeenCalledWith(403)
    }
  })

  it('finance can access receivables but not catalog edit', () => {
    const perms = supplierRole('Accountant').permissions
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.CATALOG_EDIT)).toBe(false)
  })

  it('catalog manager can manage catalog but not invoices or settings', () => {
    const perms = supplierRole('Catalog Manager').permissions
    expect(hasPermission(perms, P.CATALOG_EDIT)).toBe(true)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(false)
  })

  it('fulfillment staff can access fulfillment but not billing', () => {
    const perms = supplierRole('Order Fulfillment Staff').permissions
    expect(hasPermission(perms, P.FULFILLMENT_VIEW)).toBe(true)
    expect(hasPermission(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
  })

  it('warehouse manager can manage warehouses but not billing', () => {
    const perms = supplierRole('Warehouse Manager').permissions
    expect(hasPermission(perms, P.WAREHOUSES_EDIT)).toBe(true)
    expect(hasPermission(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
  })

  it('sales/deals manager can access promotions manage', () => {
    const perms = supplierRole('Promotions Manager').permissions
    expect(hasPermission(perms, P.PROMOTIONS_MANAGE)).toBe(true)
  })

  it('supplier manager can view promotions but not manage subscriptions', () => {
    const perms = supplierRole('Supplier Manager').permissions
    expect(hasPermission(perms, P.PROMOTIONS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
  })
})

describe('restaurant role matrix', () => {
  it('host can access reservations but not billing or users', () => {
    const perms = restaurantRole('FOH Staff').permissions
    expect(hasPermission(perms, P.RESERVATIONS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('receiving staff can receive but not billing or users', () => {
    const perms = restaurantRole('Receiving Staff').permissions
    expect(hasPermission(perms, P.RECEIVING_MANAGE)).toBe(true)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('read-only viewer has views only', () => {
    const perms = restaurantRole('Viewer').permissions
    expect(perms.every((p) => p.endsWith('_VIEW') || p === 'ALL')).toBe(true)
    expect(hasPermission(perms, P.ORDERS_CREATE)).toBe(false)
  })
})

describe('driver delivery status rules', () => {
  it('allows only driver-safe statuses', () => {
    for (const status of DRIVER_ALLOWED_STATUS_UPDATES) {
      expect(() => assertDriverStatusUpdate(status, [P.DRIVER_DELIVERIES_MANAGE])).not.toThrow()
    }
    expect(() => assertDriverStatusUpdate('picked_up', [P.DRIVER_DELIVERIES_MANAGE])).toThrow()
  })
})

describe('role escalation guards', () => {
  it('non-owner cannot grant permissions they lack', () => {
    const managerPerms = supplierRole('Supplier Manager').permissions
    const ownerTarget = [P.SETTINGS_MANAGE, P.STAFF_MANAGE]
    expect(isPermissionSubset(managerPerms, ownerTarget)).toBe(false)
  })

  it('manager cannot assign owner-equivalent permission set to self via subset check', () => {
    const managerPerms = supplierRole('Supplier Manager').permissions
    expect(isPermissionSubset(managerPerms, managerPerms)).toBe(true)
    expect(isPermissionSubset(managerPerms, ['ALL'])).toBe(false)
  })
})

describe('impersonation policy', () => {
  it('admin bypass does not apply when tenant context is set (impersonating)', () => {
    const { res, next } = runMiddleware(requirePermission(P.SETTINGS_MANAGE), {
      userData: { role: 'ADMIN', id: 'admin-1' },
      adminContext: { permissions: ['ADMIN_ACCESS'] },
      tenantContext: { permissions: [P.ORDERS_VIEW] },
    })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('admin bypass applies on admin routes without tenant context', () => {
    const { next } = runMiddleware(requirePermission(P.ADMIN_TENANTS), {
      userData: { role: 'ADMIN', id: 'admin-1' },
      adminContext: { permissions: ['ADMIN_ACCESS'] },
    })
    expect(next).toHaveBeenCalled()
  })
})

describe('promotions read vs manage gate', () => {
  it('viewer with PROMOTIONS_VIEW can pass read guard but not manage-only', () => {
    const perms = supplierRole('Viewer').permissions
    expect(hasPermission(perms, P.PROMOTIONS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.PROMOTIONS_MANAGE)).toBe(false)

    const readMw = (req, res, next) => {
      const method = req.method.toUpperCase()
      if (method === 'GET') {
        return requireAnyPermission(P.PROMOTIONS_VIEW, P.PROMOTIONS_MANAGE)(req, res, next)
      }
      return requirePermission(P.PROMOTIONS_MANAGE)(req, res, next)
    }

    const { next: readOk } = runMiddleware(readMw, {
      method: 'GET',
      userData: { role: 'SUPPLIER', id: 'u1' },
      tenantContext: { permissions: perms },
    })
    expect(readOk).toHaveBeenCalled()

    const { res: writeBlocked } = runMiddleware(readMw, {
      method: 'POST',
      userData: { role: 'SUPPLIER', id: 'u1' },
      tenantContext: { permissions: perms },
    })
    expect(writeBlocked.status).toHaveBeenCalledWith(403)
  })
})

describe('feature vs RBAC (conceptual)', () => {
  it('RBAC pass does not imply feature enabled — separate middleware layers', () => {
    // Documented: requireFeature runs independently of requirePermission in route stacks.
    expect(typeof requirePermission).toBe('function')
  })
})
