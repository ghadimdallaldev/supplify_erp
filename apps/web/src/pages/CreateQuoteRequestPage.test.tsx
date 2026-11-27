import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { CreateQuoteRequestPage } from './CreateQuoteRequestPage'

const mockProducts = vi.fn()
const mockSuppliers = vi.fn()

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/api')>()),
  useGetProductsQuery: (...a: unknown[]) => mockProducts(...a),
  useGetSuppliersQuery: (...a: unknown[]) => mockSuppliers(...a),
  useCreateQuoteRequestMutation: () => [vi.fn(), { isLoading: false }],
}))

const lastArgs = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls[mock.mock.calls.length - 1]?.[0] as Record<string, unknown>

describe('CreateQuoteRequestPage pickers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProducts.mockReturnValue({
      data: { products: [], pagination: { total: 0, limit: 20, offset: 0 } },
      isLoading: false,
      isFetching: false,
    })
    mockSuppliers.mockReturnValue({
      data: {
        suppliers: [
          { id: 's1', name: 'Fresh Farms', is_followed: true },
          { id: 's2', name: 'Fresh Fish Co', is_followed: false },
        ],
        pagination: { total: 45, limit: 20, offset: 0 },
      },
      isLoading: false,
      isFetching: false,
    })
  })

  it('quote pickers search server-side', async () => {
    renderWithProviders(<CreateQuoteRequestPage />)

    // Followed first is asked of the server, not sorted from a capped client list.
    expect(lastArgs(mockSuppliers)).toMatchObject({ sort: 'followed', limit: 20, offset: 0 })

    await userEvent.type(screen.getByTestId('quote-supplier-search'), 'fresh')
    await waitFor(() => expect(lastArgs(mockSuppliers)).toMatchObject({ q: 'fresh', offset: 0 }))

    await userEvent.type(screen.getByTestId('quote-product-search'), 'tom')
    await waitFor(() => expect(lastArgs(mockProducts)).toMatchObject({ q: 'tom', offset: 0 }))
  })

  it('marks followed suppliers and pages through the rest', async () => {
    renderWithProviders(<CreateQuoteRequestPage />)

    const followedRow = screen.getByTestId('quote-supplier-s1')
    expect(within(followedRow).getByText(/following/i)).toBeInTheDocument()
    expect(
      within(screen.getByTestId('quote-supplier-s2')).queryByText(/following/i)
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /load more suppliers/i }))
    await waitFor(() => expect(lastArgs(mockSuppliers)).toMatchObject({ offset: 20 }))
  })
})
