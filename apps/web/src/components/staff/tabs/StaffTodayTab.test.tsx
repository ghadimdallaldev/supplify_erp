import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaffTodayTab } from './StaffTodayTab'

vi.mock('../../../services/staffApi', () => ({
  useGetStaffLabourSummaryQuery: vi.fn(),
}))

import { useGetStaffLabourSummaryQuery } from '../../../services/staffApi'

describe('StaffTodayTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders KPI cards with real counts', () => {
    vi.mocked(useGetStaffLabourSummaryQuery).mockReturnValue({
      data: {
        date: '2026-06-11',
        counts: {
          scheduledToday: 5,
          clockedInNow: 2,
          lateArrivals: null,
          missedClockOuts: 0,
          pendingPto: 1,
          pendingSwaps: 0,
          estimatedLabourCostToday: null,
          overtimeRiskCount: null,
        },
        labourCostToday: { available: false },
        alerts: [],
        meta: { openEntriesIncluded: true },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    render(<StaffTodayTab onTabChange={vi.fn()} />)

    expect(screen.getByText('Scheduled today')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('All clear')).toBeInTheDocument()
  })

  it('shows healthy state when no alerts', () => {
    vi.mocked(useGetStaffLabourSummaryQuery).mockReturnValue({
      data: {
        date: '2026-06-11',
        counts: {
          scheduledToday: 0,
          clockedInNow: 0,
          lateArrivals: 0,
          missedClockOuts: 0,
          pendingPto: 0,
          pendingSwaps: 0,
          estimatedLabourCostToday: 120,
          overtimeRiskCount: 0,
        },
        labourCostToday: { available: true, amount: 120 },
        alerts: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    render(<StaffTodayTab onTabChange={vi.fn()} />)
    expect(screen.getAllByText('All clear').length).toBeGreaterThan(0)
  })
})
