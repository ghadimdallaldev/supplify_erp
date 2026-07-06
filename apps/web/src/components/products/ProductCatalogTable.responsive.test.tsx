import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { ProductCatalogTable } from './ProductCatalogTable'
import { expectLgCardTableSplit } from '../../test/viewports'
import { renderWithProviders } from '../../test/utils'

const sampleProduct = {
  id: 'p1',
  name: 'Tomatoes',
  sku: 'TOM-1',
  supplier_email: 'farm@example.com',
}

describe('ProductCatalogTable responsive layout', () => {
  it('uses lg card/table split via ResponsiveDataList', () => {
    renderWithProviders(
      <ProductCatalogTable
        filteredProducts={[sampleProduct]}
        isSupplier={false}
        isRestaurant
        onAddToCart={vi.fn()}
        onToggleFavorite={vi.fn()}
        onAdjustStock={vi.fn()}
      />
    )

    const cards = screen.getByTestId('responsive-data-list-cards')
    const table = screen.getByTestId('responsive-data-list-table')
    expectLgCardTableSplit(cards, table)
    expect(screen.getByTestId('product-card-p1')).toBeInTheDocument()
  })
})
