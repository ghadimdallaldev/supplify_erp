import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { BillingOverdueBanner } from './BillingOverdueBanner'
import { testI18n, resetTestI18n } from '../../test/i18n'

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

function renderBanner() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <BillingOverdueBanner />
    </I18nextProvider>
  )
}

describe('BillingOverdueBanner', () => {
  beforeEach(async () => {
    useGetBillingStatusQuery.mockReset()
    await resetTestI18n()
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

    renderBanner()

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

    renderBanner()

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

    renderBanner()

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

    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })
})
