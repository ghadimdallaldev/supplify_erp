import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { ProductCatalogTable } from './ProductCatalogTable'
import { expectXlCardTableSplit } from '../../test/viewports'
import { renderWithProviders } from '../../test/utils'

const sampleProduct = {
  id: 'p1',
  name: 'Tomatoes',
  sku: 'TOM-1',
  supplier_email: 'farm@example.com',
}

describe('ProductCatalogTable responsive layout', () => {
  it('keeps cards through laptop widths and switches to tables at xl', () => {
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
    expectXlCardTableSplit(cards, table)
    expect(screen.getByTestId('product-card-p1')).toBeInTheDocument()
  })
})
