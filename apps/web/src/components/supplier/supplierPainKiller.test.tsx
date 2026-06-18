import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { SupplierReceivablesPanel } from './SupplierReceivablesPanel'
import { SupplierCommandCenterPage } from '../../pages/SupplierCommandCenterPage'
import { SupplierRunSheetPage } from '../../pages/SupplierRunSheetPage'
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

const mockRunSheet = vi.fn()

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetSupplierReceivablesQuery: (...args: unknown[]) => mockReceivables(...args),
    useGetDriversQuery: (...args: unknown[]) => mockDrivers(...args),
    useGetSupplierCommandCenterQuery: (...args: unknown[]) => mockCommandCenter(...args),
    useGetSupplierRunSheetQuery: (...args: unknown[]) => mockRunSheet(...args),
    useCreateReorderReminderDraftMutation: () => [mockCreateDraft, { isLoading: false }],
    useSendInvoiceReminderMutation: () => [vi.fn(), { isLoading: false }],
    useRemindOverdueInvoicesMutation: () => [vi.fn(), { isLoading: false }],
  }
})

vi.mock('../../services/api/endpoints/finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api/endpoints/finance')>()
  return {
    ...actual,
    useSendInvoiceReminderMutation: () => [vi.fn(), { isLoading: false }],
    useRemindOverdueInvoicesMutation: () => [vi.fn(), { isLoading: false }],
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

  it('SupplierRunSheetPage renders KPIs, priorities, and delivery areas from unwrapped API data', () => {
    mockRunSheet.mockReturnValue({
      data: {
        date: '2026-06-17',
        summary: {
          kpis: {
            ordersToPrepareToday: 4,
            deliveriesPendingToday: 2,
            ordersWaitingAction: 0,
            unpaidBalance: 500,
            overdueBalance: 120,
            customersDueReorder: 3,
            lowStockCount: 0,
            openDisputes: 0,
            fulfillmentAlerts: 0,
          },
          todaysPriorities: [
            {
              id: 'deliveries',
              type: 'delivery',
              title: '2 deliveries pending',
              href: '/app/fulfillment',
            },
          ],
        },
        ordersToPick: {
          count: 1,
          orders: [
            {
              orderId: 'o-1',
              orderStatus: 'PROCESSING',
              restaurantName: 'Bistro',
              scheduledAt: '2026-06-17T08:00:00Z',
              pickListId: 'pl-1',
              pickListStatus: 'PENDING',
            },
          ],
        },
        deliveries: {
          filters: { date: '2026-06-17' },
          orders: [],
          routeSummary: [{ area: 'Downtown', orderCount: 2, pending: 1 }],
          stats: { total: 2 },
        },
        receivablesDueToday: {
          summary: { count: 0, totalBalanceDue: 0, dueTodayCount: 0, overdueCount: 0 },
          invoices: [],
        },
        reorderLeads: [],
        shortages: { count: 0, preview: [] },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderWithProviders(<SupplierRunSheetPage />)

    expect(screen.getByTestId('supplier-run-sheet-page')).toBeInTheDocument()
    expect(screen.getByTestId('run-sheet-kpi-orders')).toHaveTextContent('4')
    expect(screen.getByTestId('run-sheet-priorities')).toBeInTheDocument()
    expect(screen.getByTestId('run-sheet-priority-deliveries')).toHaveTextContent(
      '2 deliveries pending'
    )
    expect(screen.getByTestId('run-sheet-deliveries')).toHaveTextContent('Downtown')
    expect(screen.getByTestId('run-sheet-deliveries')).toHaveTextContent('2 stops')
    expect(screen.getByTestId('run-sheet-deliveries')).toHaveTextContent('1 pending')
  })
})
