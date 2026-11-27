import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { testI18n } from '../../test/i18n'
import { CategoryBrowse, CategorySearchHits } from './CategoryBrowse'
import type { CategoryDepartment } from '../../types'

const departments: CategoryDepartment[] = [
  {
    id: 'dept-produce',
    slug: 'dept-fresh-produce',
    name: 'Fresh produce',
    name_ar: 'خضار وفواكه طازجة',
    icon_key: 'carrot',
    product_count: 12,
    categories: [
      {
        id: 'leaf-veg',
        slug: 'vegetables',
        name: 'Vegetables',
        name_ar: 'خضار',
        icon_key: 'leaf',
        product_count: 9,
      },
      {
        id: 'leaf-fruit',
        slug: 'fruit',
        name: 'Fruit',
        name_ar: 'فواكه',
        icon_key: 'cherries',
        product_count: 3,
      },
    ],
  },
  {
    id: 'dept-bakery',
    slug: 'dept-bakery-pastry',
    name: 'Bakery & pastry',
    name_ar: 'مخبوزات وحلويات',
    icon_key: 'not-a-real-icon',
    product_count: 1,
    categories: [
      {
        id: 'leaf-bread',
        slug: 'bakery-bread',
        name: 'Bread',
        name_ar: 'خبز',
        icon_key: 'bread',
        product_count: 1,
      },
    ],
  },
]

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetProductCategoriesQuery: () => ({ data: { departments }, isLoading: false }),
    useSearchQuery: (args: { q: string; grouped?: boolean }, opts?: { skip?: boolean }) => ({
      data:
        opts?.skip || !args.grouped
          ? undefined
          : {
              products: [],
              suppliers: [],
              categories: [
                {
                  id: 'leaf-veg',
                  slug: 'vegetables',
                  name: 'Vegetables',
                  name_ar: 'خضار',
                  icon_key: 'leaf',
                  product_count: 9,
                },
              ],
            },
    }),
  }
})

describe('CategoryBrowse', () => {
  afterEach(async () => {
    await testI18n.changeLanguage('en')
  })

  it('category browse renders departments with icons and counts', () => {
    renderWithProviders(<CategoryBrowse />)

    const produce = screen.getByRole('link', { name: /Fresh produce/ })
    expect(produce).toHaveAttribute('href', '/app/shop/category/dept-fresh-produce')
    expect(within(produce).getByText(/12 products/)).toBeInTheDocument()
    expect(produce.querySelector('[data-icon-key="carrot"] svg')).not.toBeNull()

    // An unknown icon key falls back to a generic icon instead of rendering nothing.
    const bakery = screen.getByRole('link', { name: /Bakery & pastry/ })
    expect(bakery.querySelector('[data-icon-key="not-a-real-icon"] svg')).not.toBeNull()
    expect(within(bakery).getByText(/1 product\b/)).toBeInTheDocument()

    // The category rail lists the leaves, linking to their pages.
    const rail = screen.getByRole('navigation', { name: /categories/i })
    expect(within(rail).getByRole('link', { name: /Vegetables/ })).toHaveAttribute(
      'href',
      '/app/shop/category/vegetables'
    )
    expect(within(rail).getByRole('link', { name: /Bread/ })).toBeInTheDocument()
  })

  it('Arabic RTL category tiles mirror', async () => {
    await testI18n.changeLanguage('ar')
    renderWithProviders(<CategoryBrowse />)

    const root = screen.getByTestId('category-browse')
    expect(root).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('link', { name: /خضار وفواكه طازجة/ })).toBeInTheDocument()
    expect(screen.queryByText('Fresh produce')).not.toBeInTheDocument()
    // Directional chevrons flip in RTL.
    expect(root.querySelector('[data-testid="category-tile-chevron"]')).toHaveClass(
      'rtl:-scale-x-100'
    )
  })

  it('search shows a categories group linking to category pages', () => {
    renderWithProviders(<CategorySearchHits query="veg" />)
    const group = screen.getByRole('navigation', { name: /Categories/ })
    const link = within(group).getByRole('link', { name: /Vegetables/ })
    expect(link).toHaveAttribute('href', '/app/shop/category/vegetables')
    expect(within(link).getByText('9')).toBeInTheDocument()
  })

  it('search categories group stays hidden for short queries', () => {
    renderWithProviders(<CategorySearchHits query="v" />)
    expect(screen.queryByRole('navigation', { name: /Categories/ })).not.toBeInTheDocument()
  })
})
