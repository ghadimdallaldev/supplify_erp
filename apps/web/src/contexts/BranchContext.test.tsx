import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { BranchProvider, useBranchContext } from './BranchContext'
import { renderWithProviders } from '../test/utils'
import type { Entitlements } from '../types'

const mockEntitlements = vi.fn<[], Entitlements | undefined>(() => undefined)

vi.mock('../hooks/useEntitlements', () => ({
  useEntitlements: () => ({ entitlements: mockEntitlements(), isLoading: false }),
}))

vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isEffectiveTenant: true,
    isEffectiveSupplier: false,
    isEffectiveRestaurant: true,
  }),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetOrgBranchesQuery: () => ({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    }),
    useGetRestaurantOrgBranchesQuery: () => ({
      data: {
        organizationId: 'org-1',
        activeRestaurantId: 'rest-main',
        branches: [
          { id: 'rest-main', name: 'Main', is_main_branch: true },
          { id: 'rest-east', name: 'East', is_main_branch: false },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGetBranchesQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
    useSwitchBranchAccountMutation: () => [vi.fn(), { isLoading: false }],
    useSwitchOrgBranchContextMutation: () => [vi.fn(), { isLoading: false }],
    useSwitchRestaurantOrgBranchContextMutation: () => [vi.fn(), { isLoading: false }],
  }
})

function OrgScopeProbe() {
  const { isOrgScope, accounts } = useBranchContext()
  return (
    <div>
      <span data-testid="org-scope">{String(isOrgScope)}</span>
      <span data-testid="account-count">{accounts.length}</span>
    </div>
  )
}

function baseEntitlements(overrides: Partial<Entitlements>): Entitlements {
  return {
    tenantType: 'RESTAURANT',
    tenantId: 'rest-main',
    plan: {
      id: 'p1',
      name: 'Test',
      code: 'test',
      tenant_type: 'RESTAURANT',
      price_monthly: 0,
      price_yearly: 0,
    },
    features: {},
    limits: { branches: 3 },
    baseLimits: {},
    overrides: [],
    usage: { branches: 2 },
    ...overrides,
  }
}

describe('BranchContext multi_branch gating', () => {
  beforeEach(() => {
    mockEntitlements.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('enables org scope for Gold (multi_branch true)', () => {
    mockEntitlements.mockReturnValue(
      baseEntitlements({
        plan: {
          id: 'p1',
          name: 'Gold',
          code: 'gold',
          tenant_type: 'RESTAURANT',
          price_monthly: 149,
          price_yearly: null,
        },
        features: { multi_branch: true },
      })
    )
    renderWithProviders(
      <BranchProvider>
        <OrgScopeProbe />
      </BranchProvider>
    )
    expect(screen.getAllByTestId('org-scope').at(-1)?.textContent).toBe('true')
    expect(screen.getAllByTestId('account-count').at(-1)?.textContent).toBe('2')
  })

  it('enables org scope for Platinum (central_purchasing string on planFeatures)', () => {
    mockEntitlements.mockReturnValue(
      baseEntitlements({
        plan: {
          id: 'p1',
          name: 'Platinum',
          code: 'platinum',
          tenant_type: 'RESTAURANT',
          price_monthly: 349,
          price_yearly: null,
        },
        features: { multi_branch: false },
        planFeatures: { multi_branch: 'central_purchasing' },
      })
    )
    renderWithProviders(
      <BranchProvider>
        <OrgScopeProbe />
      </BranchProvider>
    )
    expect(screen.getAllByTestId('org-scope').at(-1)?.textContent).toBe('true')
  })

  it('enables org scope when multi_branch tier string is on features', () => {
    mockEntitlements.mockReturnValue(
      baseEntitlements({
        plan: {
          id: 'p1',
          name: 'Platinum',
          code: 'platinum',
          tenant_type: 'RESTAURANT',
          price_monthly: 349,
          price_yearly: null,
        },
        features: { multi_branch: 'central_purchasing' },
      })
    )
    renderWithProviders(
      <BranchProvider>
        <OrgScopeProbe />
      </BranchProvider>
    )
    expect(screen.getAllByTestId('org-scope').at(-1)?.textContent).toBe('true')
  })

  it('blocks org scope for Silver (multi_branch false)', () => {
    mockEntitlements.mockReturnValue(
      baseEntitlements({
        plan: {
          id: 'p1',
          name: 'Silver',
          code: 'silver',
          tenant_type: 'RESTAURANT',
          price_monthly: 49,
          price_yearly: null,
        },
        features: { multi_branch: false },
        planFeatures: { multi_branch: false },
      })
    )
    renderWithProviders(
      <BranchProvider>
        <OrgScopeProbe />
      </BranchProvider>
    )
    expect(screen.getAllByTestId('org-scope').at(-1)?.textContent).toBe('false')
  })
})
