import { describe, it, expect } from 'vitest'
import { filterAdminTenants, mapAdminTenantRow, type AdminTenantOption } from './adminTenantSearch'
import { filterAdminLimitKeys, formatPlanCodeLabel } from './adminLimitLabels'

const sampleTenants: AdminTenantOption[] = [
  {
    id: 'a1',
    name: 'Ghadi Foods',
    tenantType: 'SUPPLIER',
    slug: 'ghadi-foods',
    email: 'ops@ghadi.test',
    planCode: 'gold',
    planName: 'Supplier Growth',
    status: 'ACTIVE',
    isMainBranch: true,
    organizationId: 'org-1',
  },
  {
    id: 'b2',
    name: 'Downtown Bistro',
    tenantType: 'RESTAURANT',
    slug: 'downtown',
    email: 'chef@bistro.test',
    planCode: 'silver',
    planName: 'Restaurant Growth',
    status: 'TRIALING',
    isMainBranch: false,
    organizationId: 'org-2',
  },
]

describe('filterAdminTenants', () => {
  it('filters by name', () => {
    expect(filterAdminTenants(sampleTenants, 'ghadi')).toHaveLength(1)
    expect(filterAdminTenants(sampleTenants, 'ghadi')[0].name).toBe('Ghadi Foods')
  })

  it('filters by slug and email', () => {
    expect(filterAdminTenants(sampleTenants, 'downtown')).toHaveLength(1)
    expect(filterAdminTenants(sampleTenants, 'chef@')).toHaveLength(1)
  })

  it('filters by tenant type', () => {
    expect(filterAdminTenants(sampleTenants, '', { tenantType: 'RESTAURANT' })).toHaveLength(1)
  })

  it('filters org main branches only', () => {
    expect(filterAdminTenants(sampleTenants, '', { orgMainOnly: true })).toHaveLength(1)
  })
})

describe('mapAdminTenantRow', () => {
  it('maps supplier row fields', () => {
    const row = mapAdminTenantRow(
      {
        id: 'x',
        name: 'Acme',
        slug: 'acme',
        plan_code: 'platinum',
        subscription_status: 'ACTIVE',
        is_main_branch: true,
      },
      'SUPPLIER'
    )
    expect(row.planCode).toBe('platinum')
    expect(row.isMainBranch).toBe(true)
  })
})

describe('filterAdminLimitKeys', () => {
  const keys = [
    'branches',
    'warehouses',
    'promotions',
    'orders_per_day',
    'scheduled_order_grace_per_day',
  ]

  it('hides supplier-only keys for restaurants', () => {
    const filtered = filterAdminLimitKeys(keys, 'RESTAURANT')
    expect(filtered).toContain('branches')
    expect(filtered).not.toContain('promotions')
    expect(filtered).not.toContain('warehouses')
    expect(filtered).not.toContain('scheduled_order_grace_per_day')
  })

  it('hides restaurant-only keys for suppliers', () => {
    const filtered = filterAdminLimitKeys(keys, 'SUPPLIER')
    expect(filtered).toContain('warehouses')
    expect(filtered).not.toContain('orders_per_day')
  })
})

describe('formatPlanCodeLabel', () => {
  it('labels known tiers', () => {
    expect(formatPlanCodeLabel('free')).toBe('30-day Free Trial')
    expect(formatPlanCodeLabel('gold')).toBe('Growth / Scale')
    expect(formatPlanCodeLabel('gold', 'SUPPLIER')).toBe('Supplier Growth')
    expect(formatPlanCodeLabel('gold', 'RESTAURANT')).toBe('Restaurant Scale')
  })
})
