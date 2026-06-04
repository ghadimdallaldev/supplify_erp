import { describe, it, expect } from 'vitest'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES } from './role-matrix.js'
import { resolveRolePermissionList, getAllPermissionsForTenantType } from './tenant-roles.js'
import { hasPermission } from './permissions.js'

function role(name, tenantType) {
  const list = tenantType === 'SUPPLIER' ? SUPPLIER_SYSTEM_ROLES : RESTAURANT_SYSTEM_ROLES
  const def = list.find((r) => r.name === name)
  if (!def) throw new Error(`Role not found: ${name}`)
  return resolveRolePermissionList(def, tenantType)
}

function can(perms, key) {
  return hasPermission(perms, key)
}

describe('Restaurant default roles', () => {
  it('Owner has full restaurant permission set', () => {
    const perms = role('Owner', 'RESTAURANT')
    expect(perms.length).toBe(getAllPermissionsForTenantType('RESTAURANT').length)
    expect(can(perms, P.ORDERS_CREATE)).toBe(true)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(true)
    expect(can(perms, P.STAFF_INVITE)).toBe(true)
  })

  it('Restaurant Manager can operate orders and receiving but not roles/billing admin', () => {
    const perms = role('Restaurant Manager', 'RESTAURANT')
    expect(can(perms, P.ORDERS_CREATE)).toBe(true)
    expect(can(perms, P.RECEIVING_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(true)
    expect(can(perms, P.STAFF_INVITE)).toBe(false)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(false)
    expect(can(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
  })

  it('Purchaser can create orders but not manage team or billing', () => {
    const perms = role('Purchaser', 'RESTAURANT')
    expect(can(perms, P.ORDERS_CREATE)).toBe(true)
    expect(can(perms, P.STAFF_VIEW)).toBe(false)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(false)
    expect(can(perms, P.SUBSCRIPTIONS_VIEW)).toBe(false)
  })

  it('Receiving Staff can receive and dispute but not create orders', () => {
    const perms = role('Receiving Staff', 'RESTAURANT')
    expect(can(perms, P.RECEIVING_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_VIEW)).toBe(true)
    expect(can(perms, P.ORDERS_CREATE)).toBe(false)
    expect(can(perms, P.STAFF_INVITE)).toBe(false)
  })

  it('Accountant is finance-only', () => {
    const perms = role('Accountant', 'RESTAURANT')
    expect(can(perms, P.INVOICES_VIEW)).toBe(true)
    expect(can(perms, P.PAYMENTS_VIEW)).toBe(true)
    expect(can(perms, P.ORDERS_CREATE)).toBe(false)
    expect(can(perms, P.RECEIVING_MANAGE)).toBe(false)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(false)
    expect(can(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('Viewer is read-only with broad workspace read access', () => {
    const perms = role('Viewer', 'RESTAURANT')
    expect(can(perms, P.ORDERS_VIEW)).toBe(true)
    expect(can(perms, P.RESERVATIONS_VIEW)).toBe(true)
    expect(can(perms, P.SETTINGS_VIEW)).toBe(true)
    expect(can(perms, P.STAFF_VIEW)).toBe(true)
    expect(can(perms, P.SUBSCRIPTIONS_VIEW)).toBe(true)
    expect(can(perms, P.CHAT_VIEW)).toBe(true)
    expect(can(perms, P.ORDERS_CREATE)).toBe(false)
    expect(can(perms, P.ORDERS_EDIT)).toBe(false)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(false)
    expect(can(perms, P.STAFF_INVITE)).toBe(false)
    expect(can(perms, P.CHAT_SEND)).toBe(false)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(false)
    for (const code of perms) {
      expect(code.endsWith('_VIEW') || code.startsWith('ADMIN_')).toBe(true)
    }
  })
})

describe('Supplier default roles', () => {
  it('Owner has full supplier permission set', () => {
    const perms = role('Owner', 'SUPPLIER')
    expect(perms.length).toBe(getAllPermissionsForTenantType('SUPPLIER').length)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(true)
    expect(can(perms, P.PROMOTIONS_MANAGE)).toBe(true)
  })

  it('Supplier Manager can decline and fulfill but not manage roles', () => {
    const perms = role('Supplier Manager', 'SUPPLIER')
    expect(can(perms, P.ORDERS_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_EDIT)).toBe(true)
    expect(can(perms, P.FULFILLMENT_MANAGE)).toBe(true)
    expect(can(perms, P.STAFF_INVITE)).toBe(false)
    expect(can(perms, P.SETTINGS_MANAGE)).toBe(false)
  })

  it('Order Fulfillment Staff can update fulfillment but not decline', () => {
    const perms = role('Order Fulfillment Staff', 'SUPPLIER')
    expect(can(perms, P.ORDERS_EDIT)).toBe(true)
    expect(can(perms, P.FULFILLMENT_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(false)
  })

  it('Catalog Manager manages catalog only', () => {
    const perms = role('Catalog Manager', 'SUPPLIER')
    expect(can(perms, P.CATALOG_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(false)
    expect(can(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('Promotions Manager manages deals', () => {
    const perms = role('Promotions Manager', 'SUPPLIER')
    expect(can(perms, P.PROMOTIONS_MANAGE)).toBe(true)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(true)
    expect(can(perms, P.CATALOG_MANAGE)).toBe(false)
    expect(can(perms, P.CATALOG_VIEW)).toBe(true)
  })

  it('Accountant cannot accept/decline orders', () => {
    const perms = role('Accountant', 'SUPPLIER')
    expect(can(perms, P.INVOICES_VIEW)).toBe(true)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(false)
    expect(can(perms, P.ORDERS_EDIT)).toBe(false)
  })

  it('Viewer cannot mutate anything but can read workspace data', () => {
    const perms = role('Viewer', 'SUPPLIER')
    expect(can(perms, P.ORDERS_VIEW)).toBe(true)
    expect(can(perms, P.SETTINGS_VIEW)).toBe(true)
    expect(can(perms, P.FULFILLMENT_VIEW)).toBe(true)
    expect(can(perms, P.ORDERS_CREATE)).toBe(false)
    expect(can(perms, P.ORDERS_MANAGE)).toBe(false)
    expect(can(perms, P.CHAT_SEND)).toBe(false)
    for (const code of perms) {
      expect(code.endsWith('_VIEW') || code.startsWith('ADMIN_')).toBe(true)
    }
  })
})
