import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { SupplierQuoteResponsePage } from './SupplierQuoteResponsePage'
import { ensureTestI18n, testI18n } from '../test/i18n'
import { toast } from 'sonner'

const state = vi.hoisted(() => ({ data: null as any, submit: vi.fn() }))
vi.mock('../services/api', () => ({
  useGetSupplierQuoteRequestDetailQuery: () => ({
    data: state.data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSubmitSupplierQuoteResponseMutation: () => [state.submit, { isLoading: false }],
  useDeclineSupplierQuoteRequestMutation: () => [vi.fn(), { isLoading: false }],
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function detail() {
  return {
    id: 'qrs-1',
    quoteRequestId: 'request-1',
    status: 'responded',
    canRespond: true,
    quoteRequestStatus: 'open',
    restaurantName: 'Cafe',
    defaultCurrency: 'USD',
    items: [
      { id: 'line-1', productId: 'product-1', productName: 'Rice', quantity: 4 },
      { id: 'line-2', productId: 'product-2', productName: 'Beans', quantity: 2 },
    ],
    response: {
      note: 'Terms',
      items: [
        {
          quoteRequestItemId: 'line-1',
          isAvailable: true,
          unitPrice: 2,
          currency: 'USD',
          quantity: 4,
          deliveryDate: '2099-02-04',
          substituteProductId: 'substitute-1',
        },
        {
          quoteRequestItemId: 'line-2',
          isAvailable: true,
          unitPrice: 10000,
          currency: 'LBP',
          quantity: 2,
          deliveryDate: '2099-02-05',
        },
      ],
    },
  }
}
function renderPage() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter initialEntries={['/quote/qrs-1']}>
        <Routes>
          <Route path="/quote/:quoteRequestSupplierId" element={<SupplierQuoteResponsePage />} />
          <Route path="/app/quote-requests/supplier" element={<p>Inbox</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}
beforeEach(async () => {
  await ensureTestI18n('quotes')
  vi.clearAllMocks()
  state.data = detail()
  state.submit.mockImplementation(() => ({ unwrap: async () => ({}) }))
})
describe('supplier quote response editing', () => {
  it('retains each line currency, substitute and calendar date when editing a response', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('spinbutton')).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: 'Send response' }))
    await waitFor(() => expect(state.submit).toHaveBeenCalled())
    expect(state.submit.mock.calls[0][0].items).toEqual([
      expect.objectContaining({
        quoteRequestItemId: 'line-1',
        currency: 'USD',
        substituteProductId: 'substitute-1',
        deliveryDate: '2099-02-04',
      }),
      expect.objectContaining({
        quoteRequestItemId: 'line-2',
        currency: 'LBP',
        deliveryDate: '2099-02-05',
      }),
    ])
  })
  it('rejects zero quantities locally before submitting available lines', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('spinbutton')).toHaveLength(4))
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send response' }))
    expect(state.submit).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('renders the Arabic quantity validation message without encoding loss', async () => {
    await testI18n.changeLanguage('ar')
    try {
      renderPage()
      await waitFor(() => expect(screen.getAllByRole('spinbutton')).toHaveLength(4))
      fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '0' } })
      fireEvent.click(
        screen.getByRole('button', { name: testI18n.t('response.sendResponse', { ns: 'quotes' }) })
      )
      expect(state.submit).not.toHaveBeenCalled()
      const message = vi.mocked(toast.error).mock.calls[0][0]
      expect(message).toMatch(/[\u0600-\u06ff]/)
      expect(message).not.toContain('?')
    } finally {
      await testI18n.changeLanguage('en')
    }
  })
})
