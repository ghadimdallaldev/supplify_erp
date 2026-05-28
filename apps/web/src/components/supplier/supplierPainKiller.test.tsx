import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { SupplierReceivablesPanel } from './SupplierReceivablesPanel'
import { SupplierCommandCenterPage } from '../../pages/SupplierCommandCenterPage'
import { renderWithProviders } from '../../test/utils'

const mockReceivables = vi.fn()
const mockDrivers = vi.fn()
const mockCommandCenter = vi.fn()
const mockCreateDraft = vi.fn()

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetSupplierReceivablesQuery: (...args: unknown[]) => mockReceivables(...args),
    useGetDriversQuery: (...args: unknown[]) => mockDrivers(...args),
    useGetSupplierCommandCenterQuery: (...args: unknown[]) => mockCommandCenter(...args),
    useCreateReorderReminderDraftMutation: () => [mockCreateDraft, { isLoading: false }],
  }
})

describe('supplier pain-killer UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDrivers.mockReturnValue({ data: { drivers: [] } })
  })

  it('SupplierReceivablesPanel shows empty state when no unpaid invoices', () => {
    mockReceivables.mockReturnValue({
      data: {
        summary: {
          unpaidCount: 0,
          unpaidTotal: 0,
          overdueTotal: 0,
          partialCount: 0,
          whoOwesMeTotal: 0,
        },
        aging: {},
        invoices: [],
      },
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<SupplierReceivablesPanel />)
    expect(screen.getByTestId('supplier-receivables-empty')).toBeInTheDocument()
  })

  it('SupplierCommandCenterPage shows reorder and priorities empty states', () => {
    mockCommandCenter.mockReturnValue({
      data: {
        kpis: {
          ordersToPrepareToday: 0,
          deliveriesPendingToday: 0,
          ordersWaitingAction: 0,
          unpaidBalance: 0,
          overdueBalance: 0,
          customersDueReorder: 0,
          lowStockCount: 0,
          openDisputes: 0,
          fulfillmentAlerts: 0,
        },
        todaysPriorities: [],
        needsAttention: [],
        previews: {
          deliveries: [],
          receivables: { unpaidTotal: 0, overdueTotal: 0, topDebtors: [] },
          reorderOpportunities: [],
          lowStock: [],
          boostedDeals: { activeBoostedDeals: 0, totalViews: 0, totalClicks: 0 },
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    })
    renderWithProviders(<SupplierCommandCenterPage />)
    expect(screen.getByTestId('supplier-command-center-page')).toBeInTheDocument()
    expect(screen.getByTestId('reorder-empty')).toBeInTheDocument()
    expect(screen.getByTestId('priorities-empty')).toBeInTheDocument()
    expect(screen.getByTestId('command-center-quick-actions')).toBeInTheDocument()
    expect(screen.getByTestId('qa-deals').closest('a')).toHaveAttribute('href', '/app/promotions')
  })
})
