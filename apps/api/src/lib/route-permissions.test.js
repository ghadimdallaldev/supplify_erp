import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  staffMutationGuard,
  orgStructureGuard,
  reviewsAccessGuard,
  restaurantSupplierMutationGuard,
} from './route-permissions.js'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES } from './role-matrix.js'
import { resolveRolePermissionList } from './tenant-roles.js'
import { hasPermission } from './permissions.js'

const next = vi.fn()
const res = {}

function mockReq(method, path) {
  return { method, path }
}

function mockResWithPerms(permissions) {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    req: {
      tenantContext: { permissions },
      userData: { role: 'RESTAURANT' },
    },
  }
}

vi.mock('./rbac.js', () => ({
  requirePermission: (key) => (req, res, nextFn) => {
    const perms = req.tenantContext?.permissions ?? []
    if (perms.includes(key) || perms.includes(key.replace(/_VIEW$/, '_MANAGE'))) {
      return nextFn()
    }
    return res.status(403).json({ error: key })
  },
  requireAnyPermission:
    (...keys) =>
    (req, res, nextFn) => {
      const perms = req.tenantContext?.permissions ?? []
      if (keys.some((k) => perms.includes(k))) return nextFn()
      return res.status(403).json({ error: keys.join('|') })
    },
}))

describe('staffMutationGuard', () => {
  beforeEach(() => {
    next.mockReset()
  })

  it('allows GET without write permissions', () => {
    const req = { ...mockReq('GET', '/shifts'), tenantContext: { permissions: ['STAFF_VIEW'] } }
    staffMutationGuard(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks POST for viewer with only STAFF_VIEW', () => {
    const req = { ...mockReq('POST', '/pto'), tenantContext: { permissions: ['STAFF_VIEW'] } }
    const r = mockResWithPerms(['STAFF_VIEW'])
    staffMutationGuard(req, r, next)
    expect(next).not.toHaveBeenCalled()
    expect(r.status).toHaveBeenCalledWith(403)
  })

  it('allows POST for staff with STAFF_EDIT', () => {
    const req = {
      ...mockReq('POST', '/pto'),
      tenantContext: { permissions: ['STAFF_VIEW', 'STAFF_EDIT'] },
    }
    staffMutationGuard(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

describe('orgStructureGuard', () => {
  beforeEach(() => next.mockReset())

  it('allows GET /branches for viewer with any tenant context', () => {
    const req = { ...mockReq('GET', '/branches'), tenantContext: { permissions: [P.ORDERS_VIEW] } }
    orgStructureGuard(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks POST /branches for viewer', () => {
    const req = {
      ...mockReq('POST', '/branches'),
      tenantContext: { permissions: [P.SETTINGS_VIEW] },
    }
    const r = mockResWithPerms([P.SETTINGS_VIEW])
    orgStructureGuard(req, r, next)
    expect(next).not.toHaveBeenCalled()
    expect(r.status).toHaveBeenCalledWith(403)
  })

  it('allows POST /users/:id/role with STAFF_MANAGE', () => {
    const req = {
      ...mockReq('POST', '/users/u1/role'),
      tenantContext: { permissions: [P.STAFF_MANAGE] },
    }
    orgStructureGuard(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

describe('reviewsAccessGuard', () => {
  beforeEach(() => next.mockReset())

  it('blocks POST review for viewer', () => {
    const req = {
      ...mockReq('POST', '/suppliers/s1'),
      tenantContext: { permissions: [P.ORDERS_VIEW] },
    }
    const r = mockResWithPerms([P.ORDERS_VIEW])
    reviewsAccessGuard(req, r, next)
    expect(r.status).toHaveBeenCalledWith(403)
  })
})

describe('restaurantSupplierMutationGuard', () => {
  beforeEach(() => next.mockReset())

  it('blocks follow for viewer', () => {
    const req = {
      ...mockReq('POST', '/s1/follow'),
      tenantContext: { permissions: [P.ORDERS_VIEW] },
    }
    const r = mockResWithPerms([P.ORDERS_VIEW])
    restaurantSupplierMutationGuard(req, r, next)
    expect(r.status).toHaveBeenCalledWith(403)
  })
})

describe('role matrix write restrictions', () => {
  function rolePerms(name, tenantType) {
    const list = tenantType === 'SUPPLIER' ? SUPPLIER_SYSTEM_ROLES : RESTAURANT_SYSTEM_ROLES
    const def = list.find((r) => r.name === name)
    return resolveRolePermissionList(def, tenantType)
  }

  const writeKeys = [
    P.ORDERS_CREATE,
    P.ORDERS_EDIT,
    P.ORDERS_MANAGE,
    P.STAFF_INVITE,
    P.STAFF_MANAGE,
    P.SETTINGS_MANAGE,
    P.SETTINGS_EDIT,
    P.INVOICES_CREATE,
    P.RECEIVING_MANAGE,
    P.FULFILLMENT_MANAGE,
    P.CHAT_SEND,
    P.CHAT_MANAGE,
    P.RESERVATIONS_CREATE,
    P.RESERVATIONS_EDIT,
    P.RESERVATIONS_MANAGE,
  ]

  it('restaurant Viewer cannot perform any write action', () => {
    const perms = rolePerms('Viewer', 'RESTAURANT')
    for (const key of writeKeys) {
      expect(hasPermission(perms, key)).toBe(false)
    }
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.RESERVATIONS_VIEW)).toBe(true)
  })

  it('supplier Viewer cannot perform any write action', () => {
    const perms = rolePerms('Viewer', 'SUPPLIER')
    const supplierWriteKeys = [
      ...writeKeys,
      P.CATALOG_EDIT,
      P.CATALOG_MANAGE,
      P.INVENTORY_EDIT,
      P.INVENTORY_MANAGE,
      P.WAREHOUSES_EDIT,
      P.WAREHOUSES_MANAGE,
      P.PROMOTIONS_MANAGE,
      P.RECEIVING_MANAGE,
      P.PAYMENTS_MANAGE,
      P.SUBSCRIPTIONS_MANAGE,
    ]
    for (const key of supplierWriteKeys) {
      expect(hasPermission(perms, key)).toBe(false)
    }
    expect(hasPermission(perms, P.ORDERS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.CATALOG_VIEW)).toBe(true)
    expect(hasPermission(perms, P.FULFILLMENT_VIEW)).toBe(true)
    expect(hasPermission(perms, P.WAREHOUSES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.PROMOTIONS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(true)
    expect(hasPermission(perms, P.CHAT_VIEW)).toBe(true)
    for (const code of perms) {
      expect(code.endsWith('_VIEW') || code.startsWith('ADMIN_')).toBe(true)
    }
  })

  it('restaurant Accountant cannot access staff or settings admin', () => {
    const perms = rolePerms('Accountant', 'RESTAURANT')
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(false)
    expect(hasPermission(perms, P.ORDERS_CREATE)).toBe(false)
  })

  it('restaurant Owner has full access', () => {
    const perms = rolePerms('Owner', 'RESTAURANT')
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(true)
    expect(hasPermission(perms, P.STAFF_MANAGE)).toBe(true)
  })
})
