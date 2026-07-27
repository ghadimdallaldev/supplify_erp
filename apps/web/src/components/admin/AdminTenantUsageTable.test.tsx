import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { AdminTenantUsageTable } from './AdminTenantUsageTable'

afterEach(() => {
  cleanup()
})

const supplierPlans = [
  {
    id: '1',
    code: 'silver',
    name: 'Silver',
    tenant_type: 'SUPPLIER' as const,
    limits: { supplier_products_skus: 100, warehouses: 2, promotions: 3, storage_mb: 500 },
    features: {},
    price_per_month: 49,
    is_active: true,
  },
]

const restaurantPlans = [
  {
    id: '2',
    code: 'gold',
    name: 'Gold',
    tenant_type: 'RESTAURANT' as const,
    limits: {
      orders_per_day: 20,
      suppliers_per_restaurant: 5,
      restaurant_inventory_skus: 250,
      storage_mb: 500,
    },
    features: {},
    price_per_month: 99,
    is_active: true,
  },
  {
    id: '3',
    code: 'unlimited',
    name: 'Unlimited',
    tenant_type: 'RESTAURANT' as const,
    limits: { orders_per_day: -1 },
    features: {},
    price_per_month: 199,
    is_active: true,
  },
]

describe('AdminTenantUsageTable', () => {
  it('renders supplier usage table with status badges', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="supplier"
        suppliers={[
          {
            id: 's1',
            name: 'Acme Supply',
            plan_code: 'silver',
            plan_name: 'Silver',
            product_count: 95,
            warehouse_count: 1,
          },
        ]}
        plans={supplierPlans as any}
      />
    )
    expect(screen.getByTestId('admin-usage-table-supplier')).toBeInTheDocument()
    expect(screen.getAllByText('Acme Supply').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('usage-status-near_limit').length).toBeGreaterThan(0)
  })

  it('renders supplier active deals progress when available', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="supplier"
        suppliers={[
          {
            id: 's1',
            name: 'Deal Co',
            plan_code: 'silver',
            product_count: 10,
            warehouse_count: 1,
            active_deals_count: 2,
          },
        ]}
        plans={supplierPlans as any}
      />
    )
    expect(screen.getByText('Active deals')).toBeInTheDocument()
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  it('shows Not available for missing supplier storage', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="supplier"
        suppliers={[
          {
            id: 's1',
            name: 'No Storage',
            plan_code: 'silver',
            product_count: 1,
            warehouse_count: 1,
            storage_mb_used: null,
          },
        ]}
        plans={supplierPlans as any}
      />
    )
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
  })

  it('renders restaurant orders today against daily limit', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="restaurant"
        restaurants={[
          {
            id: 'r1',
            name: 'Cafe One',
            plan_code: 'gold',
            orders_today: 18,
            orders_last_30d: 51,
            connected_suppliers_count: 4,
            inventory_skus_count: 100,
          },
        ]}
        plans={restaurantPlans as any}
      />
    )
    expect(screen.getByText('Orders today')).toBeInTheDocument()
    expect(screen.getByText(/18 \/ 20/)).toBeInTheDocument()
    expect(screen.getAllByTestId('usage-status-near_limit').length).toBeGreaterThan(0)
  })

  it('shows unlimited for restaurant with -1 daily limit', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="restaurant"
        restaurants={[
          {
            id: 'r2',
            name: 'Big Kitchen',
            plan_code: 'unlimited',
            orders_today: 50,
            orders_last_30d: 200,
          },
        ]}
        plans={restaurantPlans as any}
      />
    )
    expect(screen.getByText(/50 \/ Unlimited/)).toBeInTheDocument()
  })

  it('shows Not available when orders_today is missing', () => {
    renderWithProviders(
      <AdminTenantUsageTable
        mode="restaurant"
        restaurants={[
          {
            id: 'r3',
            name: 'Legacy Cafe',
            plan_code: 'gold',
            orders_last_30d: 10,
          },
        ]}
        plans={restaurantPlans as any}
      />
    )
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
  })

  it('shows empty state when no tenants match', () => {
    renderWithProviders(<AdminTenantUsageTable mode="restaurant" restaurants={[]} plans={[]} />)
    expect(screen.getByText('No matching tenants')).toBeInTheDocument()
  })
})
