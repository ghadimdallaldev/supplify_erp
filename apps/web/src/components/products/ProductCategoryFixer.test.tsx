import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ProductCategoryFixer } from './ProductCategoryFixer'
import type { CategoryDepartment } from '../../types'

const updateProduct = vi.fn()
const departments: CategoryDepartment[] = [
  {
    id: 'dept-dairy',
    slug: 'dept-dairy-eggs-cheese',
    name: 'Dairy, eggs & cheese',
    name_ar: 'ألبان وبيض وأجبان',
    icon_key: 'cheese',
    product_count: 1,
    categories: [
      {
        id: 'leaf-cheese',
        slug: 'cheese',
        name: 'Cheese',
        name_ar: 'أجبان',
        icon_key: 'cheese',
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
    useGetCategorySuggestionsQuery: () => ({ data: undefined }),
    useUpdateProductMutation: () => [updateProduct, { isLoading: false }],
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

describe('ProductCategoryFixer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateProduct.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    // jsdom has no scrollIntoView; cmdk scrolls the highlighted option into view.
    Element.prototype.scrollIntoView = vi.fn()
    // ...nor ResizeObserver, which the cmdk list uses to size itself.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('lets a supplier choose the category for a product that needs one', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ProductCategoryFixer product={{ id: 'p1', name: 'Burrata', category_needs_review: true }} />
    )
    await user.click(screen.getByRole('button', { name: /Needs a category/ }))
    await user.click(await screen.findByRole('combobox', { name: /Category for Burrata/ }))
    await user.click(await screen.findByRole('option', { name: /Cheese/ }))
    expect(updateProduct).toHaveBeenCalledWith({ id: 'p1', data: { category_id: 'leaf-cheese' } })
  })
})
