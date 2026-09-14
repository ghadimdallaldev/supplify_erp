import { type ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '../i18n'
import enCalendar from '../i18n/locales/en/calendar.json'
import { CalendarView } from './CalendarView'

const navigateMock = vi.hoisted(() => vi.fn())
const canMock = vi.hoisted(() => vi.fn(() => true))

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
    default: React.forwardRef<
      HTMLDivElement,
      {
        dateClick?: (info: { date: Date }) => void
        eventClick?: (info: {
          event: { startStr?: string; endStr?: string; extendedProps: unknown }
          jsEvent?: { preventDefault: () => void }
        }) => void
      }
    >((props, _ref) =>
      React.createElement(
        'div',
        { 'data-testid': 'full-calendar' },
        props.dateClick &&
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'calendar-date-click',
              onClick: () => props.dateClick?.({ date: new Date('2026-06-15T10:00:00.000Z') }),
            },
            'Pick date'
          ),
        props.eventClick &&
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'calendar-event-click',
              onClick: () =>
                props.eventClick?.({
                  event: {
                    startStr: '2026-06-15T10:00:00.000Z',
                    extendedProps: {
                      id: 'evt-1',
                      orderId: 'order-abc-123',
                      type: 'DELIVERY_SCHEDULE',
                      status: 'PLACED',
                      statusCategory: 'pending',
                      start: '2026-06-15T10:00:00.000Z',
                      totalAmount: 120,
                      counterpartName: 'Test Supplier',
                      role: 'RESTAURANT',
                    },
                  },
                  jsEvent: { preventDefault: vi.fn() },
                }),
            },
            'Open event'
          )
      )
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

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: canMock,
    canAny: (...keys: string[]) => keys.some((key) => canMock(key)),
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

function renderCalendar(props: ComponentProps<typeof CalendarView> = {}) {
  return render(
    <MemoryRouter>
      <CalendarView role="RESTAURANT" {...props} />
    </MemoryRouter>
  )
}

describe('CalendarView order creation CTA', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(async () => {
    navigateMock.mockClear()
    canMock.mockReset()
    canMock.mockReturnValue(true)
    i18n.addResourceBundle('en', 'calendar', enCalendar, true, true)
    await i18n.changeLanguage('en')
  })

  it('routes restaurant calendar creation to the cart order workflow', async () => {
    const user = userEvent.setup()
    renderCalendar({ role: 'RESTAURANT' })

    expect(screen.queryByText(/add event/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /\+ create order/i }))

    expect(navigateMock).toHaveBeenCalledWith('/app/cart')
  })

  it('routes supplier calendar creation to the manual order workflow entry point', async () => {
    const user = userEvent.setup()
    renderCalendar({ role: 'SUPPLIER' })

    await user.click(screen.getByRole('button', { name: /\+ create manual order/i }))

    expect(navigateMock).toHaveBeenCalledWith('/app/orders')
  })

  it('shows create order CTA for tenant users with ORDERS_CREATE (not only platform admin)', () => {
    renderCalendar({ role: 'RESTAURANT', isAdmin: false })

    expect(screen.getByRole('button', { name: /\+ create order/i })).toBeInTheDocument()
    expect(canMock).toHaveBeenCalledWith('ORDERS_CREATE')
  })

  it('hides create order CTA when user lacks ORDERS_CREATE', () => {
    canMock.mockReturnValue(false)
    renderCalendar({ role: 'RESTAURANT' })

    expect(screen.queryByRole('button', { name: /\+ create order/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('calendar-date-click')).not.toBeInTheDocument()
  })

  it('navigates to cart with scheduledAt when a date is clicked', async () => {
    const user = userEvent.setup()
    renderCalendar({ role: 'RESTAURANT' })

    await user.click(screen.getByTestId('calendar-date-click'))

    expect(navigateMock).toHaveBeenCalledWith(
      `/app/cart?scheduledAt=${encodeURIComponent('2026-06-15T10:00:00.000Z')}`
    )
  })

  it('navigates supplier date clicks to orders with scheduledAt', async () => {
    const user = userEvent.setup()
    renderCalendar({ role: 'SUPPLIER' })

    await user.click(screen.getByTestId('calendar-date-click'))

    expect(navigateMock).toHaveBeenCalledWith(
      `/app/orders?scheduledAt=${encodeURIComponent('2026-06-15T10:00:00.000Z')}`
    )
  })

  it('shows View order link in event detail sheet when orderId is present', async () => {
    const user = userEvent.setup()
    renderCalendar({ role: 'RESTAURANT' })

    await user.click(screen.getByTestId('calendar-event-click'))

    const viewOrderLink = screen.getByRole('link', { name: /view order/i })
    expect(viewOrderLink).toHaveAttribute('href', '/app/orders/order-abc-123')
  })
})
