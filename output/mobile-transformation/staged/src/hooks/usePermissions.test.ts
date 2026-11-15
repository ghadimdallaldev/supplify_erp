import {
  isTenantOwner,
  resolveAppRoleNav,
  userHasPermission,
} from '../hooks/usePermissions'
import type { User } from '../types/supplify'

const baseUser = (overrides: Partial<User>): User => ({
  id: '1',
  email: 'u@test.com',
  displayName: 'User',
  role: 'RESTAURANT',
  ...overrides,
})

describe('resolveAppRoleNav', () => {
  it('routes driver-only supplier to driver', () => {
    const nav = resolveAppRoleNav(
      baseUser({
        role: 'SUPPLIER',
        workspace: { tenantId: 's1', tenantType: 'SUPPLIER', tenantName: 'S', roleName: 'Driver' },
        tenantPermissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
      })
    )
    expect(nav).toBe('driver')
  })

  it('routes restaurant user to restaurant', () => {
    expect(resolveAppRoleNav(baseUser({ role: 'RESTAURANT' }))).toBe('restaurant')
  })

  it('routes pending users', () => {
    expect(resolveAppRoleNav(baseUser({ role: 'PENDING' }))).toBe('pending')
  })

  it('routes personal consumers to the consumer navigator', () => {
    expect(resolveAppRoleNav(baseUser({ role: 'CONSUMER' }))).toBe('consumer')
  })

  it('treats tenant owners as allowed for mobile feature gates', () => {
    const owner = baseUser({ tenantRoles: ['Owner'], tenantPermissions: [] })
    expect(isTenantOwner(owner)).toBe(true)
    expect(userHasPermission(owner, 'ORDERS_VIEW')).toBe(true)
  })

  it('does not treat a tenant role named Org Owner as workspace owner', () => {
    const fake = baseUser({ tenantRoles: ['Org Owner'], tenantPermissions: [] })
    expect(isTenantOwner(fake)).toBe(false)
    expect(userHasPermission(fake, 'ORDERS_VIEW')).toBe(false)
  })

  it('lets manage permission satisfy import and view-costs gates', () => {
    const manager = baseUser({ tenantPermissions: ['CATALOG_MANAGE', 'RECIPES_MANAGE'] })
    expect(userHasPermission(manager, 'CATALOG_IMPORT')).toBe(true)
    expect(userHasPermission(manager, 'RECIPES_VIEW_COSTS')).toBe(true)
  })
})
