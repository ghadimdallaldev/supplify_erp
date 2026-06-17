import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../../services/api'
import { AdminLimitsTab } from './AdminLimitsTab'

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
  return render(
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
})
