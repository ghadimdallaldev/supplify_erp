import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../test/utils'
import { CategoryPage } from './CategoryPage'

const getProducts = vi.fn()

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetProductCategoriesQuery: () => ({
      data: {
        departments: [
          {
            id: 'dept-bakery',
            slug: 'dept-bakery-pastry',
            name: 'Bakery & pastry',
            name_ar: 'مخبوزات وحلويات',
            icon_key: 'bread',
            product_count: 0,
            categories: [
              {
                id: 'leaf-bread',
                slug: 'bakery-bread',
                name: 'Bread',
                name_ar: 'خبز',
                icon_key: 'bread',
                product_count: 0,
              },
            ],
          },
        ],
      },
      isLoading: false,
    }),
    useGetProductsQuery: (args: unknown) => {
      getProducts(args)
      return {
        data: { products: [], pagination: { total: 0, limit: 24, offset: 0 } },
        isLoading: false,
        isFetching: false,
      }
    },
  }
})

describe('CategoryPage', () => {
  it('category page empty state', async () => {
    window.history.pushState({}, '', '/app/shop/category/bakery-bread')
    renderWithProviders(
      <Routes>
        <Route path="/app/shop/category/:slug" element={<CategoryPage />} />
      </Routes>
    )

    expect(await screen.findByRole('heading', { name: 'Bread' })).toBeInTheDocument()
    expect(getProducts).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'leaf-bread' }))
    expect(screen.getByText('No suppliers sell this yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Request a quote/ })).toHaveAttribute(
      'href',
      '/app/quote-requests/new'
    )
  })
})
