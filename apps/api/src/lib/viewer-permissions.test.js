import { describe, it, expect } from 'vitest'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import {
  getWorkspaceViewPermissions,
  isWritePermission,
  assertNoWritePermissions,
} from './viewer-permissions.js'
import { RESTAURANT_VIEWER, SUPPLIER_VIEWER } from './role-matrix.js'

describe('viewer-permissions', () => {
  it('restaurant viewer includes all workspace view keys and no writes', () => {
    const views = getWorkspaceViewPermissions('RESTAURANT')
    assertNoWritePermissions(views, 'RESTAURANT viewer')
    expect(views).toContain(P.ORDERS_VIEW)
    expect(views).toContain(P.RESERVATIONS_VIEW)
    expect(views).toContain(P.SETTINGS_VIEW)
    expect(views).toContain(P.STAFF_VIEW)
    expect(views).toContain(P.SUBSCRIPTIONS_VIEW)
    expect(views).not.toContain(P.WAREHOUSES_VIEW)
    expect(views).not.toContain(P.FULFILLMENT_VIEW)
  })

  it('supplier viewer includes supplier-only views', () => {
    const views = getWorkspaceViewPermissions('SUPPLIER')
    assertNoWritePermissions(views, 'SUPPLIER viewer')
    expect(views).toContain(P.FULFILLMENT_VIEW)
    expect(views).toContain(P.WAREHOUSES_VIEW)
    expect(views).not.toContain(P.RESERVATIONS_VIEW)
  })

  it('role-matrix Viewer bundles match workspace view sets', () => {
    expect(RESTAURANT_VIEWER).toEqual(getWorkspaceViewPermissions('RESTAURANT'))
    expect(SUPPLIER_VIEWER).toEqual(getWorkspaceViewPermissions('SUPPLIER'))
  })

  it('detects write permission suffixes', () => {
    expect(isWritePermission(P.ORDERS_CREATE)).toBe(true)
    expect(isWritePermission(P.CHAT_SEND)).toBe(true)
    expect(isWritePermission(P.ORDERS_VIEW)).toBe(false)
  })
})
