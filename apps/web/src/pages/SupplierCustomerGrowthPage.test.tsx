import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/utils'
import { SupplierCustomerGrowthPage } from './SupplierCustomerGrowthPage'

const mockMetrics = vi.fn()
const mockProspects = vi.fn()
const { mutation } = vi.hoisted(() => ({
  mutation: () => [vi.fn(), { isLoading: false }],
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, canAny: () => true }),
}))
vi.mock('../lib/planFeatureGates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/planFeatureGates')>()),
  canUseSupplierGrowth: () => true,
}))
vi.mock('../lib/tenantRoles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tenantRoles')>()),
  canViewSupplierGrowth: () => true,
}))
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/api')>()),
  useGetEntitlementsQuery: () => ({ data: { entitlements: {} } }),
}))
vi.mock('../services/api/endpoints/growth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/api/endpoints/growth')>()),
  useGetSupplierGrowthMetricsQuery: (...a: unknown[]) => mockMetrics(...a),
  useGetSupplierProspectsQuery: (...a: unknown[]) => mockProspects(...a),
  useGetSupplierSponsorshipsQuery: () => ({ data: { sponsorships: [] }, refetch: vi.fn() }),
  usePreviewCustomerImportMutation: mutation,
  useExecuteCustomerImportMutation: mutation,
  useInviteProspectMutation: mutation,
  useCreateSponsorshipOfferMutation: mutation,
  usePaySponsorshipMutation: mutation,
  useRetrySponsorshipPaymentMutation: mutation,
  useCancelSponsorshipMutation: mutation,
}))

const prospect = (over: Record<string, unknown>) => ({
  id: 'pr-1',
  name: 'Imported Cafe',
  email: 'owner@imported.test',
  phone: null,
  contact_person: null,
  area_region: null,
  status: 'imported',
  invited_at: null,
  ...over,
})

describe('SupplierCustomerGrowthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMetrics.mockReturnValue({
      data: {
        importedCustomers: 3,
        followingCustomers: 1,
        invitedCustomers: 1,
        sponsoredCustomers: 0,
        registeredCustomers: 0,
        convertedCustomers: 0,
        revenueGenerated: 0,
        rewardsEarned: { freeMonths: 0, accountCredit: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    mockProspects.mockReturnValue({
      data: {
        prospects: [
          // A stale or tampered payload must still not surface any match information.
          prospect({
            id: 'pr-1',
            status: 'following',
            match_status: 'existing_supplify',
            matched_restaurant_id: 'r-secret',
            matched_restaurant_name: 'Secret Bistro',
          }),
          prospect({ id: 'pr-2', name: 'Corner Deli', status: 'invited' }),
          prospect({ id: 'pr-3', name: 'Harbour Grill', status: 'imported' }),
        ],
        pagination: { total: 3, limit: 50, offset: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
  })

  it('growth page never renders match data', () => {
    renderWithProviders(<SupplierCustomerGrowthPage />)

    expect(screen.getByText('Imported Cafe')).toBeInTheDocument()
    expect(screen.queryByText('Secret Bistro')).not.toBeInTheDocument()
    expect(screen.queryByText(/existing_supplify|import_only/)).not.toBeInTheDocument()
    expect(screen.queryByText(/already on supplify/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument()
  })

  it('shows the imported / invited / following statuses and the following count', () => {
    renderWithProviders(<SupplierCustomerGrowthPage />)

    expect(screen.getByTestId('prospect-status-pr-1')).toHaveTextContent('Following')
    expect(screen.getByTestId('prospect-status-pr-2')).toHaveTextContent('Invited')
    expect(screen.getByTestId('prospect-status-pr-3')).toHaveTextContent('Imported')
    expect(screen.getByTestId('growth-metrics')).toHaveTextContent(/following/i)
  })

  it('offers the same invite and sponsor actions to every prospect not yet following', () => {
    renderWithProviders(<SupplierCustomerGrowthPage />)

    const following = screen.getByTestId('prospect-actions-pr-1')
    expect(following).not.toHaveTextContent(/invite/i)
    expect(following).toHaveTextContent(/sponsor/i)
    for (const id of ['pr-2', 'pr-3']) {
      const actions = screen.getByTestId(`prospect-actions-${id}`)
      expect(actions).toHaveTextContent(/invite/i)
      expect(actions).toHaveTextContent(/sponsor/i)
    }
  })
})
