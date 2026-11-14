import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { testI18n } from '../test/i18n'
import { ProductDetailPage } from './ProductDetailPage'
const product = {
  id: 'p1',
  name: 'Tomatoes',
  supplier_id: 's1',
  supplier_name: 'Cedar',
  available_qty: 100,
  moq: 2,
  order_multiple: 6,
  current_price: 10,
  currency: 'USD',
}
const addItem = vi.fn(),
  refetch = vi.fn()
let result: any
vi.mock('../services/api', () => ({ useGetProductQuery: () => result }))
vi.mock('../hooks/useCartActions', () => ({ useCartActions: () => ({ addItem }) }))
vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({ isEffectiveSupplier: false }),
}))
vi.mock('../components/supplier/ProductSubstitutesSection', () => ({
  ProductSubstitutesSection: () => null,
}))
function show() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter
        initialEntries={[{ pathname: '/app/products/p1', state: { addToCartQty: 11 } }]}
      >
        <Routes>
          <Route path="/app/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  result = { currentData: { product }, isFetching: false, refetch }
})
describe('reorder product handoff', () => {
  it('retains the suggested quantity and respects the supplier pack size before adding to cart', async () => {
    show()
    await waitFor(() => expect(screen.getByLabelText('Quantity')).toHaveValue(12))
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    expect(addItem).toHaveBeenCalledWith({ productId: 'p1', product, quantity: 12 })
  })
  it('shows a retry for a server failure rather than claiming the product does not exist', async () => {
    result = { ...result, currentData: undefined, error: { status: 500 } }
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this product')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
