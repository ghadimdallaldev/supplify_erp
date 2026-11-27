import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ProductFormDialog } from './ProductFormDialog'
import { EMPTY_PRODUCT_FORM, type ProductFormState } from './productsShared'
import type { CategoryDepartment } from '../../types'

const suggestionCalls: string[] = []

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetCategorySuggestionsQuery: (args: { name: string }, opts?: { skip?: boolean }) => {
      if (opts?.skip) return { data: undefined, isFetching: false }
      suggestionCalls.push(args.name)
      return {
        data: {
          autoCategoryId: 'leaf-bread',
          suggestions: [
            {
              categoryId: 'leaf-bread',
              name: 'Bread',
              name_ar: 'خبز',
              departmentId: 'dept-bakery',
              departmentName: 'Bakery & pastry',
              departmentNameAr: 'مخبوزات وحلويات',
              score: 1,
            },
          ],
        },
        isFetching: false,
      }
    },
    useCreateCategoryRequestMutation: () => [vi.fn(), { isLoading: false }],
  }
})

const departments: CategoryDepartment[] = [
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
      {
        id: 'leaf-pastry',
        slug: 'pastry',
        name: 'Pastry',
        name_ar: 'معجنات',
        icon_key: 'cake',
        product_count: 0,
      },
    ],
  },
]

function Harness({ onSubmit }: { onSubmit: (form: ProductFormState) => void }) {
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM)
  const [newTag, setNewTag] = useState('')
  return (
    <ProductFormDialog
      showAddProduct
      setShowAddProduct={() => {}}
      productForm={productForm}
      setProductForm={setProductForm}
      newTag={newTag}
      setNewTag={setNewTag}
      departments={departments}
      shelves={[
        { id: 'shelf-1', name: 'Fridge', name_ar: null, display_order: 0, product_count: 2 },
      ]}
      tagsData={undefined}
      warehousesData={undefined}
      imagePreview={null}
      handleImageSelect={() => {}}
      handleSubmitProduct={() => onSubmit(productForm)}
      isCreating={false}
      isUploadingImage={false}
    />
  )
}

describe('ProductFormDialog', () => {
  it('product form requires a category and pre-selects suggestion', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Harness onSubmit={onSubmit} />)

    const create = screen.getByRole('button', { name: 'Create Product' })
    expect(create).toBeDisabled()
    expect(screen.getByText('Choose a category for this product')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Product Name/), 'Sourdough loaf')

    const combobox = screen.getByRole('combobox', { name: /category/i })
    await waitFor(() => expect(combobox).toHaveTextContent('Bread'))
    // Debounced: the suggestion lookup only ran for the settled name.
    expect([...new Set(suggestionCalls)]).toEqual(['Sourdough loaf'])
    expect(screen.getByText(/Suggested/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Fridge/ }))
    await waitFor(() => expect(create).toBeEnabled())
    await user.click(create)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'leaf-bread', shelfIds: ['shelf-1'] })
    )

    expect(screen.getByRole('button', { name: /Request a category/ })).toBeInTheDocument()
  })
})
