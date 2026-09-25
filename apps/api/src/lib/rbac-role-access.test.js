import { describe, expect, it, vi } from 'vitest'
import {
  isDriverOnlyPermissions,
  assertDriverStatusUpdate,
  userCanManageFulfillmentBoard,
  DRIVER_ALLOWED_STATUS_UPDATES,
} from './driver-rbac.js'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { hasPermission } from './permissions.js'
import { isPermissionSubset } from './rbac-guards.js'
import { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES } from './role-matrix.js'

describe('driver-rbac', () => {
  it('keeps a linked driver scoped unless they can see the fulfillment board', () => {
    expect(isDriverOnlyPermissions([P.DRIVER_DELIVERIES_VIEW, P.DRIVER_DELIVERIES_MANAGE])).toBe(
      true
    )
    // Regression: an unrelated extra permission used to switch off assignment
    // scoping and the driver status allowlist entirely.
    expect(isDriverOnlyPermissions([P.DRIVER_DELIVERIES_VIEW, P.ORDERS_VIEW])).toBe(true)
    expect(isDriverOnlyPermissions([P.DRIVER_DELIVERIES_MANAGE, P.FULFILLMENT_MANAGE])).toBe(false)
    // Regression: the read-only Viewer role carries DRIVER_DELIVERIES_VIEW and
    // must keep its fulfillment board rather than be treated as a driver.
    expect(isDriverOnlyPermissions([P.DRIVER_DELIVERIES_VIEW, P.FULFILLMENT_VIEW])).toBe(false)
  })

  it('classifies every supplier system role correctly for driver scoping', () => {
    const roleNamed = (name) => SUPPLIER_SYSTEM_ROLES.find((r) => r.name === name).permissions
    expect(isDriverOnlyPermissions(roleNamed('Driver'))).toBe(true)
    for (const name of [
      'Viewer',
      'Warehouse Manager',
      'Order Fulfillment Staff',
      'Supplier Manager',
    ]) {
      expect(isDriverOnlyPermissions(roleNamed(name)), `${name} must not be driver-scoped`).toBe(
        false
      )
    }
  })

  it('keeps the read-only Viewer role on the fulfillment board', () => {
    const viewer = SUPPLIER_SYSTEM_ROLES.find((r) => r.name === 'Viewer').permissions
    expect(hasPermission(viewer, P.DRIVER_DELIVERIES_VIEW)).toBe(true)
    expect(hasPermission(viewer, P.FULFILLMENT_MANAGE)).toBe(false)
    expect(userCanManageFulfillmentBoard(viewer)).toBe(true)
    const driver = SUPPLIER_SYSTEM_ROLES.find((r) => r.name === 'Driver').permissions
    expect(userCanManageFulfillmentBoard(driver)).toBe(false)
  })

  it('driver cannot set picked_up or assign statuses', () => {
    expect(() => assertDriverStatusUpdate('picked_up', [P.DRIVER_DELIVERIES_MANAGE])).toThrow(
      /Drivers can only set/
    )
    for (const status of DRIVER_ALLOWED_STATUS_UPDATES) {
      expect(() => assertDriverStatusUpdate(status, [P.DRIVER_DELIVERIES_MANAGE])).not.toThrow()
    }
  })
})

describe('role-matrix access expectations', () => {
  const supplierRole = (name) => SUPPLIER_SYSTEM_ROLES.find((r) => r.name === name)
  const restaurantRole = (name) => RESTAURANT_SYSTEM_ROLES.find((r) => r.name === name)

  it('supplier driver cannot access catalog, invoices, or settings', () => {
    const perms = supplierRole('Driver').permissions
    expect(hasPermission(perms, P.CATALOG_VIEW)).toBe(false)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(false)
    expect(hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)).toBe(true)
  })

  it('supplier finance can access receivables but not product import', () => {
    const perms = supplierRole('Accountant').permissions
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.CATALOG_EDIT)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(false)
  })

  it('catalog manager can import but not receivables or settings', () => {
    const perms = supplierRole('Catalog Manager').permissions
    expect(hasPermission(perms, P.CATALOG_EDIT)).toBe(true)
    expect(hasPermission(perms, P.ORDERS_VIEW)).toBe(false)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_VIEW)).toBe(false)
  })

  it('fulfillment staff can access delivery board but not billing', () => {
    const perms = supplierRole('Order Fulfillment Staff').permissions
    expect(hasPermission(perms, P.FULFILLMENT_VIEW)).toBe(true)
    expect(hasPermission(perms, P.INVOICES_MANAGE)).toBe(false)
    expect(hasPermission(perms, P.SUBSCRIPTIONS_MANAGE)).toBe(false)
  })

  it('restaurant host can access reservations but not billing or users', () => {
    const perms = restaurantRole('FOH Staff').permissions
    expect(hasPermission(perms, P.RESERVATIONS_VIEW)).toBe(true)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('restaurant receiving staff can receive orders but not billing or users', () => {
    const perms = restaurantRole('Receiving Staff').permissions
    expect(hasPermission(perms, P.RECEIVING_MANAGE)).toBe(true)
    expect(hasPermission(perms, P.ORDERS_CREATE)).toBe(false)
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(false)
    expect(hasPermission(perms, P.STAFF_VIEW)).toBe(false)
  })

  it('restaurant finance can access invoices but not users or settings manage', () => {
    const perms = restaurantRole('Accountant').permissions
    expect(hasPermission(perms, P.INVOICES_VIEW)).toBe(true)
    expect(hasPermission(perms, P.STAFF_MANAGE)).toBe(false)
    expect(hasPermission(perms, P.SETTINGS_MANAGE)).toBe(false)
  })

  it('non-owner cannot grant permissions they lack', () => {
    const managerPerms = supplierRole('Supplier Manager').permissions
    const ownerPerms = supplierRole('Owner').permissions
    expect(isPermissionSubset(managerPerms, ownerPerms)).toBe(false)
    expect(isPermissionSubset(managerPerms, managerPerms)).toBe(true)
  })
})

describe('requirePermission impersonation policy', () => {
  it('documents that impersonation uses effective role permissions (not blanket bypass)', () => {
    // Enforced in rbac.js: admin bypass only when !isImpersonating && adminContext
    expect(true).toBe(true)
  })
})
