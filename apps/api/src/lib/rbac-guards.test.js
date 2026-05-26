import { describe, expect, it } from 'vitest'
import { isPermissionSubset } from './rbac-guards.js'

describe('rbac-guards', () => {
  it('isPermissionSubset returns true when actor has all target permissions', () => {
    const actor = ['ORDERS_VIEW', 'ORDERS_MANAGE', 'STAFF_INVITE']
    const target = ['ORDERS_VIEW', 'STAFF_INVITE']
    expect(isPermissionSubset(actor, target)).toBe(true)
  })

  it('isPermissionSubset returns false when actor lacks a permission', () => {
    const actor = ['ORDERS_VIEW']
    const target = ['ORDERS_VIEW', 'SETTINGS_MANAGE']
    expect(isPermissionSubset(actor, target)).toBe(false)
  })

  it('isPermissionSubset accepts _MANAGE wildcard', () => {
    const actor = ['ORDERS_MANAGE']
    const target = ['ORDERS_VIEW', 'ORDERS_EDIT']
    expect(isPermissionSubset(actor, target)).toBe(true)
  })
})
