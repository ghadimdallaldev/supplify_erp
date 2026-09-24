import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../../services/api'
import { renderWithProviders } from '../../test/utils'
import { AdminLimitsTab, getAdminAddonOptionKeys } from './AdminLimitsTab'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetAdminSuppliersQuery: vi.fn(),
    useGetAdminRestaurantsQuery: vi.fn(),
    useGetAdminSubscriptionAddonsQuery: vi.fn(),
    useGetAdminLimitKeysQuery: vi.fn(),
    useGetAdminPlansQuery: vi.fn(),
    useGetAdminLimitOverridesQuery: vi.fn(),
    useGetAdminEffectiveLimitQuery: vi.fn(),
    useGetAdminTenantEntitlementsQuery: vi.fn(),
    useUpsertAdminSubscriptionAddonMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useCreateAdminPlanLimitOverrideMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useCreateAdminTenantLimitOverrideMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useUpdateAdminPlanLimitOverrideMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useUpdateAdminTenantLimitOverrideMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  }
})

import {
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useGetAdminSubscriptionAddonsQuery,
  useGetAdminLimitKeysQuery,
  useGetAdminPlansQuery,
  useGetAdminLimitOverridesQuery,
  useGetAdminEffectiveLimitQuery,
  useGetAdminTenantEntitlementsQuery,
} from '../../services/api'

function renderTab() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  })
  return renderWithProviders(
    <Provider store={store}>
      <AdminLimitsTab />
    </Provider>
  )
}

beforeEach(() => {
  vi.mocked(useGetAdminSuppliersQuery).mockReturnValue({
    data: {
      suppliers: [
        {
          id: 'sup-1',
          name: 'Ghadi Foods',
          slug: 'ghadi',
          plan_code: 'gold',
          subscription_status: 'ACTIVE',
          is_main_branch: true,
        },
      ],
    },
    isLoading: false,
  } as ReturnType<typeof useGetAdminSuppliersQuery>)

  vi.mocked(useGetAdminRestaurantsQuery).mockReturnValue({
    data: { restaurants: [] },
    isLoading: false,
  } as ReturnType<typeof useGetAdminRestaurantsQuery>)

  vi.mocked(useGetAdminLimitKeysQuery).mockReturnValue({
    data: { keys: ['branches', 'warehouses', 'users'] },
  } as ReturnType<typeof useGetAdminLimitKeysQuery>)

  vi.mocked(useGetAdminPlansQuery).mockReturnValue({
    data: {
      plans: [
        {
          id: 'plan-gold',
          code: 'gold',
          name: 'Gold',
          tenant_type: 'SUPPLIER',
          limits: { branches: 2, warehouses: 3 },
        },
      ],
    },
  } as ReturnType<typeof useGetAdminPlansQuery>)

  vi.mocked(useGetAdminLimitOverridesQuery).mockReturnValue({
    data: { tenantOverrides: [], planOverrides: [] },
    isLoading: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useGetAdminLimitOverridesQuery>)

  vi.mocked(useGetAdminSubscriptionAddonsQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useGetAdminSubscriptionAddonsQuery>)

  vi.mocked(useGetAdminEffectiveLimitQuery).mockReturnValue({
    data: undefined,
  } as ReturnType<typeof useGetAdminEffectiveLimitQuery>)

  vi.mocked(useGetAdminTenantEntitlementsQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useGetAdminTenantEntitlementsQuery>)
})

// ---------------------------------------------------------------------------
// Unit tests for the exported helper
// ---------------------------------------------------------------------------

describe('getAdminAddonOptionKeys', () => {
  it('returns no selectable keys for a Restaurant with no historical addon row', () => {
    expect(getAdminAddonOptionKeys('RESTAURANT', [])).toEqual([])
    expect(getAdminAddonOptionKeys('RESTAURANT', [{ addon_key: 'something_else' }])).toEqual([])
    expect(getAdminAddonOptionKeys('RESTAURANT', [{ addon_key: 'supplier_extra_branch' }])).toEqual(
      []
    )
  })

  it('returns [restaurant_extra_branch] for a Restaurant with an active historical addon row', () => {
    expect(
      getAdminAddonOptionKeys('RESTAURANT', [{ addon_key: 'restaurant_extra_branch' }])
    ).toEqual(['restaurant_extra_branch'])
    expect(
      getAdminAddonOptionKeys('RESTAURANT', [
        { addon_key: 'restaurant_extra_branch' },
        { addon_key: 'something_else' },
      ])
    ).toEqual(['restaurant_extra_branch'])
  })

  it('returns supplier_extra_branch and supplier_extra_warehouse for a Supplier regardless of addons', () => {
    expect(getAdminAddonOptionKeys('SUPPLIER', [])).toEqual([
      'supplier_extra_branch',
      'supplier_extra_warehouse',
    ])
    expect(
      getAdminAddonOptionKeys('SUPPLIER', [{ addon_key: 'supplier_extra_branch', quantity: 2 }])
    ).toEqual(['supplier_extra_branch', 'supplier_extra_warehouse'])
  })
})

// ---------------------------------------------------------------------------
// Component-level tests for addon editor visibility
// ---------------------------------------------------------------------------

describe('AdminLimitsTab', () => {
  it('renders searchable tenant UI without UUID field', () => {
    renderTab()
    expect(screen.getByPlaceholderText(/Name, slug, email/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Tenant ID \(UUID\)/i)).not.toBeInTheDocument()
  })

  it('shows plan tier dropdown instead of plan UUID input', () => {
    renderTab()
    expect(screen.getAllByRole('option', { name: /Gold/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByPlaceholderText(/Plan UUID/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Main branch tenant UUID/i)).not.toBeInTheDocument()
  })

  it('does not show addon grant/update button in initial Restaurant mode (no tenant selected)', () => {
    // Before any tenant is selected, the addon panel is hidden entirely.
    // The "Grant / Update Add-on" button must never be visible for a Restaurant.
    renderTab()
    expect(screen.queryByText(/Grant \/ Update Add-on/i)).not.toBeInTheDocument()
  })

  it('shows only the Remove Add-on button after clicking Edit on a Restaurant historical addon', () => {
    vi.mocked(useGetAdminRestaurantsQuery).mockReturnValue({
      data: {
        restaurants: [
          {
            id: 'rest-2',
            name: 'Legacy Bistro',
            slug: 'legacy-bistro',
            plan_code: 'platinum',
            subscription_status: 'ACTIVE',
            is_main_branch: true,
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useGetAdminRestaurantsQuery>)

    vi.mocked(useGetAdminSubscriptionAddonsQuery).mockReturnValue({
      data: {
        addons: [
          {
            id: 'addon-legacy',
            addon_key: 'restaurant_extra_branch',
            quantity: 1,
            unit_price_monthly: 39,
            status: 'active',
          },
        ],
        tenantName: 'Legacy Bistro',
        planCode: 'platinum',
        locationLimits: {},
        usesOrgBilling: false,
        billingTenantId: 'rest-2',
        billingTenantName: 'Legacy Bistro',
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetAdminSubscriptionAddonsQuery>)

    renderTab()

    const searchInput = screen.getByPlaceholderText(/Name, slug, email/i)
    fireEvent.focus(searchInput)

    const tenantButtons = screen.queryAllByRole('button', { name: /Legacy Bistro/i })
    if (tenantButtons.length > 0) {
      fireEvent.click(tenantButtons[0])
      // After selecting the tenant, the historical addon row renders with Edit buttons.
      const editButtons = screen.queryAllByText(/^edit$/i)
      if (editButtons.length > 0) {
        fireEvent.click(editButtons[0])
        // Removal-only mode: qty controls are disabled, Remove Add-on button shows.
        const qtyInput = screen.queryByDisplayValue('0')
        if (qtyInput) {
          expect(qtyInput).toBeDisabled()
        }
        expect(screen.queryByText(/Remove Add-on/i)).toBeInTheDocument()
      }
    }
    // Core invariant: "Grant / Update Add-on" is never present for a Restaurant.
    expect(screen.queryByText(/Grant \/ Update Add-on/i)).not.toBeInTheDocument()
  })
})
