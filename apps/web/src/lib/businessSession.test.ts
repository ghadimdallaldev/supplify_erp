import { afterEach, describe, expect, it } from 'vitest'
import type { User } from '../types'
import { businessSessionKey } from './businessSession'
import { warehouseScopeAllowsPermission } from './warehouseAccess'
import {
  getCartStorageKey,
  loadCartFromStorage,
  saveCartToStorage,
  setCartBusinessScope,
} from '../features/cart/cartPersistence'

const user = {
  id: 'staff-a',
  role: 'SUPPLIER',
  workspace: { tenantId: 'branch-a' },
  tenantPermissions: ['ORDERS_VIEW'],
  warehouseAccess: { mode: 'assigned', warehouseIds: ['a'] },
} as User
afterEach(() => {
  setCartBusinessScope(null)
  localStorage.clear()
})

describe('business access isolation', () => {
  it('changes when permissions or warehouse grants change in the same tenant', () => {
    expect(businessSessionKey(user)).not.toBe(
      businessSessionKey({ ...user, tenantPermissions: [] })
    )
    expect(businessSessionKey(user)).not.toBe(
      businessSessionKey({ ...user, warehouseAccess: { mode: 'assigned', warehouseIds: ['b'] } })
    )
    expect(
      businessSessionKey({
        ...user,
        warehouseAccess: { mode: 'assigned', warehouseIds: ['b', 'a'] },
      })
    ).toBe(
      businessSessionKey({
        ...user,
        warehouseAccess: { mode: 'assigned', warehouseIds: ['a', 'b'] },
      })
    )
  })
  it('does not restore a saved draft under another workspace or a reduced grant', () => {
    setCartBusinessScope(businessSessionKey(user))
    saveCartToStorage('same@example.com', {
      items: [],
      drafts: [{ id: 'private', name: 'Private draft', items: [], createdAt: '2026-11-16' }],
    })
    const before = getCartStorageKey('same@example.com')
    setCartBusinessScope(
      businessSessionKey({ ...user, warehouseAccess: { mode: 'assigned', warehouseIds: [] } })
    )
    expect(getCartStorageKey('same@example.com')).not.toBe(before)
    expect(loadCartFromStorage('same@example.com')).toBeNull()
  })
  it('keeps scoped order and warehouse actions while hiding tenant-wide unsupported views', () => {
    expect(warehouseScopeAllowsPermission(user, 'WAREHOUSES_VIEW')).toBe(true)
    expect(warehouseScopeAllowsPermission(user, 'ORDERS_VIEW')).toBe(true)
    expect(warehouseScopeAllowsPermission(user, 'INVENTORY_VIEW')).toBe(false)
    expect(warehouseScopeAllowsPermission(user, 'ORDERS_CREATE')).toBe(false)
    expect(
      warehouseScopeAllowsPermission(
        { ...user, warehouseAccess: { mode: 'all', warehouseIds: [] } },
        'INVENTORY_VIEW'
      )
    ).toBe(true)
  })
})
