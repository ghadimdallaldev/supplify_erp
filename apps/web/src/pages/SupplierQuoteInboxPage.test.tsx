import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { SupplierQuoteInboxPage } from './SupplierQuoteInboxPage'
import { ensureTestI18n, testI18n } from '../test/i18n'

const inboxQuerySpy = vi.fn()
const declineSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))

/** Local-calendar ISO date. toISOString() would shift the day either side of UTC. */
function isoDaysFromToday(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const entries = [
  {
    id: 'qrs-1',
    quoteRequestId: 'qr-1',
    status: 'pending' as const,
    quoteRequestStatus: 'open',
    createdAt: '2026-09-01T10:00:00.000Z',
    restaurantName: 'Cafe One',
    itemCount: 3,
    neededBy: isoDaysFromToday(1),
    viewedAt: null,
  },
  {
    id: 'qrs-2',
    quoteRequestId: 'qr-2',
    status: 'declined' as const,
    quoteRequestStatus: 'open',
    createdAt: '2026-08-30T10:00:00.000Z',
    restaurantName: 'Bistro Two',
    itemCount: 1,
    neededBy: null,
    viewedAt: '2026-08-31T10:00:00.000Z',
    declineReason: 'Out of stock',
  },
]

vi.mock('../services/api', () => ({
  useGetSupplierQuoteInboxQuery: (args: unknown) => {
    inboxQuerySpy(args)
    return {
      data: {
        inbox: entries,
        counts: { total: 2, pending: 1, responded: 0, declined: 1, unread: 1, urgent: 1 },
        pagination: { page: 1, limit: 20, total: 2 },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
  useDeclineSupplierQuoteRequestMutation: () => [declineSpy, { isLoading: false }],
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderPage() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <SupplierQuoteInboxPage />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('SupplierQuoteInboxPage', () => {
  beforeEach(async () => {
    await ensureTestI18n('quotes')
    inboxQuerySpy.mockClear()
    declineSpy.mockClear()
  })

  it('lists inbox entries with an urgency badge and a decline reason', () => {
    renderPage()
    expect(screen.getByText('Cafe One')).toBeInTheDocument()
    expect(screen.getByText('Bistro Two')).toBeInTheDocument()
    // Needed tomorrow -> flagged as due soon. The badge wraps an icon beside the
    // label, so match on the element's full text rather than a lone text node.
    expect(
      screen.getByText((_content, el) => el?.textContent?.trim() === 'Due in 1 day')
    ).toBeInTheDocument()
    expect(screen.getByText(/Out of stock/)).toBeInTheDocument()
  })

  it('offers decline only on pending entries whose request is still open', () => {
    renderPage()
    expect(screen.getAllByTestId('quote-inbox-decline')).toHaveLength(1)
  })

  it('sends the selected status tab to the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('quote-inbox-tab-pending'))
    await waitFor(() => {
      expect(inboxQuerySpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'pending', page: 1 })
      )
    })
  })

  it('debounces the search box into a single query argument', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('quote-inbox-search'), 'Cafe')
    await waitFor(() => {
      expect(inboxQuerySpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Cafe' }))
    })
  })

  it('declines a request with the reason the supplier typed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('  No capacity  ')
    renderPage()
    await user.click(screen.getByTestId('quote-inbox-decline'))
    await waitFor(() => {
      expect(declineSpy).toHaveBeenCalledWith({
        quoteRequestSupplierId: 'qrs-1',
        reason: 'No capacity',
      })
    })
  })
})
