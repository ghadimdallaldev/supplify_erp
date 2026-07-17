import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardWidgetGrid } from './DashboardWidgetGrid'
import { renderWithProviders } from '../../test/utils'

vi.mock('../../hooks/redux', () => ({
  useAppSelector: () => ({ user: { role: 'RESTAURANT' } }),
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}))

const mockAiRecommend = vi.fn().mockReturnValue({
  unwrap: () => Promise.resolve({ recommendations: [] }),
})

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetEntitlementsQuery: () => ({ data: undefined }),
    useAiRecommendReorderAssistanceMutation: () => [mockAiRecommend, { isLoading: false }],
  }
})

vi.mock('../../services/api/endpoints/growth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api/endpoints/growth')>()
  return {
    ...actual,
    useGetSupplierGrowthMetricsQuery: () => ({ data: undefined }),
  }
})

vi.mock('./SpendTrendChart', () => ({
  SpendTrendChart: () => <div data-testid="spend-trend-chart-mock" />,
}))

function renderRestaurantSpendTrend(overrides: Record<string, unknown> = {}) {
  const onPeriodDaysChange = vi.fn()
  renderWithProviders(
    <DashboardWidgetGrid
      isRestaurant
      isSupplier={false}
      showRestaurantSection={(flag: string) => flag === 'showSpendTrend'}
      orders={[]}
      stats={{ totalSpent: 0 }}
      spendTrend={[]}
      spendTrendSource={null}
      spendTrendPeriodTotal={0}
      periodDays={30}
      onPeriodDaysChange={onPeriodDaysChange}
      financeInvoicesEnabled
      lowStockItems={[]}
      smartReorderEnabled={false}
      inventoryMgmtEnabled={false}
      reorderSuggestions={undefined}
      reorderRemindersData={undefined}
      expirySummaryData={undefined}
      atRiskData={undefined}
      quickListsData={undefined}
      addingSuggestionId={null}
      setAddingSuggestionId={vi.fn()}
      addItemToQuickList={vi.fn()}
      restaurantLayout={null}
      {...overrides}
    />
  )
  return { onPeriodDaysChange }
}

describe('DashboardWidgetGrid spend trend period', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders 7d/30d/90d toggles with the active period pressed', () => {
    renderRestaurantSpendTrend({ periodDays: 30 })

    expect(screen.getByTestId('spend-trend-period-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('spend-trend-period-7d')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('spend-trend-period-30d')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('spend-trend-period-90d')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onPeriodDaysChange when a different period is selected', async () => {
    const user = userEvent.setup()
    const { onPeriodDaysChange } = renderRestaurantSpendTrend({ periodDays: 30 })

    await user.click(screen.getByTestId('spend-trend-period-7d'))

    expect(onPeriodDaysChange).toHaveBeenCalledWith(7)
  })

  it('shows the label for the selected period', () => {
    renderRestaurantSpendTrend({
      periodDays: 90,
      spendTrend: [{ name: '06-01', value: 42 }],
      spendTrendSource: 'orders',
      spendTrendPeriodTotal: 42,
    })

    expect(screen.getByText('Last 90 days (orders)')).toBeInTheDocument()
  })
})
