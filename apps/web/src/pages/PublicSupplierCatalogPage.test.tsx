import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/utils'
import { PublicSupplierCatalogPage } from './PublicSupplierCatalogPage'

const productCalls: Array<Record<string, unknown>> = []

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetPublicSupplierQuery: () => ({
      data: {
        id: 'sup-1',
        name: 'Fresh Co',
        slug: 'fresh-co',
        productCount: 2,
        publicSalesEnabled: true,
      },
      isLoading: false,
      isError: false,
    }),
    useGetSupplierQuery: () => ({ data: undefined }),
    useGetPublicSupplierPricedProductsQuery: () => ({ data: undefined, isLoading: false }),
    useGetPublicSupplierProductsQuery: (args: Record<string, unknown>) => {
      productCalls.push(args)
      return {
        data: {
          products: [
            {
              id: 'p1',
              name: 'Burrata',
              sku: 'BUR-1',
              category: 'Cheese',
              categoryId: 'leaf-cheese',
              categoryName: 'Cheese',
              categoryNameAr: 'أجبان',
              departmentId: 'dept-dairy',
              shelfIds: ['shelf-1'],
            },
          ],
          categories: [
            {
              id: 'leaf-cheese',
              slug: 'cheese',
              name: 'Cheese',
              name_ar: 'أجبان',
              name_fr: null,
              icon_key: 'cheese',
              department_id: 'dept-dairy',
              product_count: 1,
            },
          ],
          shelves: [
            {
              id: 'shelf-1',
              supplierId: 'sup-1',
              name: 'Cheese counter',
              name_ar: null,
              display_order: 0,
              product_count: 1,
            },
            {
              id: 'shelf-2',
              supplierId: 'sup-1',
              name: 'Empty shelf',
              name_ar: null,
              display_order: 1,
              product_count: 0,
            },
          ],
          pagination: { page: 1, limit: 24, total: 1 },
        },
        isLoading: false,
        isFetching: false,
      }
    },
  }
})

describe('PublicSupplierCatalogPage', () => {
  beforeEach(() => {
    productCalls.length = 0
    // jsdom has no scrollIntoView; CategoryNav scrolls the active pill into view.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('storefront shows shelf sections and filters by shelf and category', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PublicSupplierCatalogPage forcedSlug="fresh-co" />)

    const shelvesNav = screen.getByRole('tablist', { name: /Shelves/ })
    expect(shelvesNav).toHaveTextContent('All products')
    expect(shelvesNav).toHaveTextContent('Cheese counter')
    // Empty shelves are not shown to shoppers.
    expect(shelvesNav).not.toHaveTextContent('Empty shelf')

    await user.click(screen.getByRole('tab', { name: /Cheese counter/ }))
    expect(productCalls.at(-1)).toMatchObject({ shelfId: 'shelf-1' })

    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by category/ }),
      'leaf-cheese'
    )
    expect(productCalls.at(-1)).toMatchObject({ shelfId: 'shelf-1', categoryId: 'leaf-cheese' })
    expect(productCalls.at(-1)).not.toHaveProperty('category')
  })
})
