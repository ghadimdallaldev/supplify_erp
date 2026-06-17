import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CalendarView } from './CalendarView'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@fullcalendar/react', async () => {
  const React = await import('react')
  return {
    default: React.forwardRef<HTMLDivElement>((_props, _ref) =>
      React.createElement('div', { 'data-testid': 'full-calendar' })
    ),
  }
})

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }))
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }))
vi.mock('@fullcalendar/interaction', () => ({ default: {} }))
vi.mock('@fullcalendar/list', () => ({ default: {} }))

vi.mock('../hooks/useOrdersCalendar', () => ({
  OrdersCalendarFetchError: class OrdersCalendarFetchError extends Error {
    details?: Record<string, unknown>

    constructor(name: string, message: string, details?: Record<string, unknown>) {
      super(message)
      this.name = name
      this.details = details
    }
  },
  useOrdersCalendar: () => ({
    data: {
      events: [],
      filters: { statuses: [], suppliers: [], branches: [], categories: [] },
      pagination: { total: 0 },
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: {
      entitlements: {
        plan: { name: 'Gold' },
        features: { order_calendar: true },
      },
    },
    isLoading: false,
  }),
}))

vi.mock('../lib/planLimits', () => ({
  isEntitlementFeatureEnabled: () => true,
}))

vi.mock('../hooks/redux', () => ({
  useAppDispatch: () => vi.fn(),
}))

describe('CalendarView order creation CTA', () => {
  beforeEach(() => {
    navigateMock.mockClear()
  })

  it('routes restaurant calendar creation to the cart order workflow', async () => {
    const user = userEvent.setup()
    render(<CalendarView role="RESTAURANT" isAdmin />)

    expect(screen.queryByText(/add event/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /\+ create order/i }))

    expect(navigateMock).toHaveBeenCalledWith('/app/cart')
  })

  it('routes supplier calendar creation to the manual order workflow entry point', async () => {
    const user = userEvent.setup()
    render(<CalendarView role="SUPPLIER" isAdmin />)

    await user.click(screen.getByRole('button', { name: /\+ create manual order/i }))

    expect(navigateMock).toHaveBeenCalledWith('/app/orders')
  })
})
