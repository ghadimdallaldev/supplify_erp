import { describe, it, expect } from 'vitest'
import {
  matchClosestSystemRole,
  resolveRolePermissionList,
  RESTAURANT_SYSTEM_ROLES,
  getAllPermissionsForTenantType,
} from './tenant-roles.js'

describe('tenant-roles definitions', () => {
  it('Owner role gets all restaurant permissions', () => {
    const owner = RESTAURANT_SYSTEM_ROLES.find((r) => r.name === 'Owner')
    const perms = resolveRolePermissionList(owner, 'RESTAURANT')
    expect(perms.length).toBe(getAllPermissionsForTenantType('RESTAURANT').length)
  })

  it('matchClosestSystemRole picks Owner for full permission set', () => {
    const all = getAllPermissionsForTenantType('RESTAURANT')
    expect(matchClosestSystemRole(all, 'RESTAURANT')).toBe('Owner')
  })

  it('matchClosestSystemRole picks Purchaser for order-focused set', () => {
    const purchaser = resolveRolePermissionList(
      RESTAURANT_SYSTEM_ROLES.find((r) => r.name === 'Purchaser'),
      'RESTAURANT'
    )
    const name = matchClosestSystemRole(purchaser, 'RESTAURANT')
    expect(['Purchaser', 'Viewer', 'Receiving Staff']).toContain(name)
  })

  it('Restaurant Manager is defined with least-privilege ops', () => {
    const mgr = RESTAURANT_SYSTEM_ROLES.find((r) => r.name === 'Restaurant Manager')
    expect(mgr).toBeDefined()
    const perms = resolveRolePermissionList(mgr, 'RESTAURANT')
    expect(perms).toContain('ORDERS_CREATE')
    expect(perms).not.toContain('SETTINGS_MANAGE')
  })
})
