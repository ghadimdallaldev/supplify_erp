import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ProductCatalogTable } from './ProductCatalogTable'
import { renderWithProviders } from '../../test/utils'

vi.mock('../marketplace/FollowAndAddButton', () => ({
  FollowAndAddButton: ({ outOfStock }: { outOfStock?: boolean }) => (
    <button data-out-of-stock={String(Boolean(outOfStock))}>add</button>
  ),
}))

// Non-followers get an in_stock flag and no quantity (spec §10 Q2).
const nonFollower = (inStock: boolean) => ({
  id: 'p1',
  name: 'Tomatoes',
  sku: 'TOM-1',
  unit: 'kg',
  supplier_id: 's1',
  is_followed: false,
  can_order: false,
  in_stock: inStock,
})

function renderRow(product: Record<string, unknown>) {
  renderWithProviders(
    <ProductCatalogTable
      filteredProducts={[product]}
      isSupplier={false}
      isRestaurant
      onAddToCart={vi.fn()}
      onToggleFavorite={vi.fn()}
      onAdjustStock={vi.fn()}
    />
  )
}

describe('restaurant stock label', () => {
  it('shows In stock for a non-follower with in_stock true, never a 0 quantity', () => {
    renderRow(nonFollower(true))
    expect(screen.getAllByText('In stock').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^0 kg$/)).toBeNull()
    for (const b of screen.getAllByText('add'))
      expect(b).toHaveAttribute('data-out-of-stock', 'false')
  })

  it('shows Out of stock for a non-follower with in_stock false', () => {
    renderRow(nonFollower(false))
    expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0)
  })

  it('keeps the quantity for followers', () => {
    renderRow({ ...nonFollower(true), is_followed: true, can_order: true, available_qty: 12 })
    expect(screen.getAllByText('12 kg').length).toBeGreaterThan(0)
  })
})
