import { describe, expect, it } from 'vitest'
import {
  getRestaurantDashboardLayout,
  isPromotionsFocusedSupplier,
  reorderNavSectionsForPrimaryFocus,
  resolveWorkspacePersona,
  restaurantAnalyticsNavAllowed,
  restaurantReportsNavAllowed,
} from './workspaceRoleProfile'

function perms(...keys: string[]) {
  const set = new Set(keys)
  return (key: string) => set.has(key)
}

describe('isPromotionsFocusedSupplier', () => {
  it('is true for Promotions Manager-like permissions', () => {
    expect(
      isPromotionsFocusedSupplier(
        perms(
          'PROMOTIONS_VIEW',
          'PROMOTIONS_MANAGE',
          'ORDERS_VIEW',
          'ORDERS_MANAGE',
          'CATALOG_VIEW'
        )
      )
    ).toBe(true)
  })

  it('is false when user has fulfillment access', () => {
    expect(
      isPromotionsFocusedSupplier(perms('PROMOTIONS_VIEW', 'FULFILLMENT_VIEW', 'ORDERS_VIEW'))
    ).toBe(false)
  })

  it('is false when user has catalog write access', () => {
    expect(
      isPromotionsFocusedSupplier(perms('PROMOTIONS_VIEW', 'CATALOG_MANAGE', 'CATALOG_VIEW'))
    ).toBe(false)
  })

  it('is false without promotions view', () => {
    expect(isPromotionsFocusedSupplier(perms('ORDERS_VIEW', 'FULFILLMENT_VIEW'))).toBe(false)
  })
})

describe('resolveWorkspacePersona', () => {
  it('resolves Promotions Manager by role name', () => {
    const profile = resolveWorkspacePersona({
      tenantType: 'SUPPLIER',
      roleName: 'Promotions Manager',
      can: perms('PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE', 'ORDERS_VIEW'),
    })
    expect(profile.id).toBe('supplier_promotions')
    expect(profile.primaryNavHref).toBe('/app/promotions')
    expect(profile.homePath).toBe('/app/promotions')
    expect(profile.overviewNav?.label).toBe('Sales Hub')
  })

  it('promotes primary nav to top of sidebar', () => {
    const sections = reorderNavSectionsForPrimaryFocus(
      [
        { label: 'OVERVIEW', items: [{ href: '/app/command-center', name: 'Sales Hub' }] },
        { label: 'INTELLIGENCE', items: [{ href: '/app/promotions', name: 'Deals' }] },
        { label: 'OPERATIONS', items: [{ href: '/app/orders', name: 'Orders' }] },
      ],
      '/app/promotions'
    )
    expect(sections[0].items[0].href).toBe('/app/promotions')
    expect(sections[0].items[1]?.href).toBe('/app/command-center')
  })

  it('resolves restaurant receiving staff home', () => {
    const profile = resolveWorkspacePersona({
      tenantType: 'RESTAURANT',
      roleName: 'Receiving Staff',
      can: perms('RECEIVING_VIEW', 'RECEIVING_MANAGE', 'ORDERS_VIEW'),
    })
    expect(profile.homePath).toBe('/app/receiving')
    expect(profile.dashboard).toBeNull()
  })

  it('resolves restaurant purchaser ordering focus', () => {
    const profile = resolveWorkspacePersona({
      tenantType: 'RESTAURANT',
      roleName: 'Purchaser',
      can: perms('ORDERS_VIEW', 'ORDERS_CREATE', 'CATALOG_VIEW', 'INVENTORY_VIEW'),
    })
    expect(profile.homePath).toBe('/app/cart')
    expect(profile.primaryNavHref).toBe('/app/cart')
    expect(profile.restaurantDashboardMode).toBe('ordering')
    expect(profile.showGlobalReports).toBe(false)
  })

  it('hides reports nav for purchaser but shows for manager', () => {
    const purchaser = resolveWorkspacePersona({
      tenantType: 'RESTAURANT',
      roleName: 'Purchaser',
      can: perms('ORDERS_VIEW', 'ORDERS_CREATE'),
    })
    const manager = resolveWorkspacePersona({
      tenantType: 'RESTAURANT',
      roleName: 'Restaurant Manager',
      can: perms('ORDERS_VIEW', 'ORDERS_MANAGE', 'INVOICES_VIEW'),
    })
    expect(restaurantReportsNavAllowed(purchaser, perms('ORDERS_VIEW'))).toBe(false)
    expect(restaurantReportsNavAllowed(manager, perms('ORDERS_VIEW', 'ORDERS_MANAGE'))).toBe(true)
  })

  it('ordering dashboard hides calendar and reorder actions for viewer', () => {
    const layout = getRestaurantDashboardLayout('ordering', perms('ORDERS_VIEW'), true)
    expect(layout.showCalendar).toBe(false)
    expect(layout.allowReorderActions).toBe(false)
  })

  it('finance dashboard focuses on spend not reorder alerts', () => {
    const layout = getRestaurantDashboardLayout('finance', perms('INVOICES_VIEW', 'ORDERS_VIEW'))
    expect(layout.showSpendTrend).toBe(true)
    expect(layout.showReorderAlerts).toBe(false)
    expect(layout.showCalendar).toBe(false)
  })

  it('receiving staff has no analytics nav access', () => {
    const profile = resolveWorkspacePersona({
      tenantType: 'RESTAURANT',
      roleName: 'Receiving Staff',
      can: perms('RECEIVING_VIEW', 'RECEIVING_MANAGE', 'ORDERS_VIEW'),
    })
    expect(restaurantAnalyticsNavAllowed(profile, perms('ORDERS_VIEW'))).toBe(false)
  })
})
