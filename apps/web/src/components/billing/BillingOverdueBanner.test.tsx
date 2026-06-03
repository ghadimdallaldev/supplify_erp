import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BillingOverdueBanner } from './BillingOverdueBanner'

const useGetBillingStatusQuery = vi.fn()

vi.mock('../../services/api', () => ({
  useGetBillingStatusQuery: () => useGetBillingStatusQuery(),
}))

vi.mock('../../hooks/redux', () => ({
  useAppDispatch: () => vi.fn(),
}))

vi.mock('../../lib/openPaymentModal', () => ({
  openOverduePayment: vi.fn(),
}))

vi.mock('../../lib/openBrowseUpgrade', () => ({
  openBrowseUpgrade: vi.fn(),
}))

describe('BillingOverdueBanner', () => {
  beforeEach(() => {
    useGetBillingStatusQuery.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows Free Trial expired copy (not generic overdue)', () => {
    useGetBillingStatusQuery.mockReturnValue({
      data: {
        access: {
          isLocked: true,
          isPastDue: false,
          freeSandboxExpired: true,
          lockReason: 'free_sandbox_expired',
          pendingActivation: false,
        },
      },
    })

    render(<BillingOverdueBanner />)

    expect(screen.getByText('Free Trial expired')).toBeInTheDocument()
    expect(screen.getByText(/Your Free Trial has expired/i)).toBeInTheDocument()
    expect(screen.queryByText(/overdue subscription payment/i)).not.toBeInTheDocument()
  })

  it('shows pending activation with activate CTA', () => {
    useGetBillingStatusQuery.mockReturnValue({
      data: {
        access: {
          isLocked: true,
          isPastDue: false,
          pendingActivation: true,
          freeSandboxExpired: false,
        },
      },
    })

    render(<BillingOverdueBanner />)

    expect(screen.getByText('Account pending activation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activate account/i })).toBeInTheDocument()
  })

  it('shows generic overdue when locked without trial or activation', () => {
    useGetBillingStatusQuery.mockReturnValue({
      data: {
        access: {
          isLocked: true,
          isPastDue: true,
          pendingActivation: false,
          freeSandboxExpired: false,
          lockReason: 'payment_overdue',
          daysUntilLock: null,
        },
        amountDue: 120,
      },
    })

    render(<BillingOverdueBanner />)

    expect(screen.getByText('Account locked — payment required')).toBeInTheDocument()
    expect(screen.getByText(/Pay your balance to restore full access/i)).toBeInTheDocument()
    expect(screen.queryByText('Free Trial expired')).not.toBeInTheDocument()
  })

  it('renders nothing when account is not locked or past due', () => {
    useGetBillingStatusQuery.mockReturnValue({
      data: {
        access: {
          isLocked: false,
          isPastDue: false,
        },
      },
    })

    const { container } = render(<BillingOverdueBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
