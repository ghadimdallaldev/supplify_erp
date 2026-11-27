import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils'
import { AdminCatalogTab } from './AdminCatalogTab'
import type { CategoryDepartment } from '../../../types'

const approve = vi.fn()
const merge = vi.fn()
const reject = vi.fn()
const addCategory = vi.fn()
const reorder = vi.fn()
const ok = () => ({ unwrap: () => Promise.resolve({}) })

const departments: CategoryDepartment[] = [
  {
    id: 'dept-produce',
    slug: 'dept-fresh-produce',
    name: 'Fresh produce',
    name_ar: 'خضار وفواكه طازجة',
    icon_key: 'carrot',
    product_count: 4,
    categories: [
      {
        id: 'leaf-veg',
        slug: 'vegetables',
        name: 'Vegetables',
        name_ar: 'خضار',
        icon_key: 'leaf',
        product_count: 3,
      },
      {
        id: 'leaf-mush',
        slug: 'mushrooms',
        name: 'Mushrooms',
        name_ar: 'فطر',
        icon_key: 'leaf',
        product_count: 1,
      },
    ],
  },
]

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/api')>()
  return {
    ...actual,
    useGetProductCategoriesQuery: () => ({ data: { departments }, isLoading: false }),
    useGetAdminCategoryRequestsQuery: () => ({
      data: {
        requests: [
          {
            id: 'req-1',
            supplier_name: 'Fresh Co',
            proposed_name: 'Truffles',
            proposed_name_ar: null,
            proposed_parent_id: 'dept-produce',
            proposed_parent_name: 'Fresh produce',
            status: 'pending',
            product_count: 2,
            created_at: '2026-11-20T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    }),
    useApproveCategoryRequestMutation: () => [approve, { isLoading: false }],
    useMergeCategoryRequestMutation: () => [merge, { isLoading: false }],
    useRejectCategoryRequestMutation: () => [reject, { isLoading: false }],
    useAddPlatformCategoryMutation: () => [addCategory, { isLoading: false }],
    useUpdatePlatformCategoryMutation: () => [vi.fn(), { isLoading: false }],
    useReorderPlatformCategoriesMutation: () => [reorder, { isLoading: false }],
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

describe('AdminCatalogTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of [approve, merge, reject, addCategory, reorder]) fn.mockReturnValue(ok())
  })

  it('approves a pending request into the chosen department', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminCatalogTab active />)
    const row = screen.getByTestId('category-request-req-1')
    expect(within(row).getByText('Truffles')).toBeInTheDocument()
    expect(within(row).getByText(/Fresh Co/)).toBeInTheDocument()
    expect(within(row).getByText(/2 products/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /^Approve/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('combobox', { name: /Department/ })).toHaveValue('dept-produce')
    await user.click(within(dialog).getByRole('button', { name: /Add category/ }))
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1', parentId: 'dept-produce', name: 'Truffles' })
    )
  })

  it('merges a request into an existing category', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminCatalogTab active />)
    const row = screen.getByTestId('category-request-req-1')
    await user.click(within(row).getByRole('button', { name: /^Merge/ }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: /Existing category/ }),
      'leaf-mush'
    )
    await user.click(within(dialog).getByRole('button', { name: /^Merge$/ }))
    expect(merge).toHaveBeenCalledWith({ id: 'req-1', categoryId: 'leaf-mush' })
  })

  it('rejects a request with a note', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminCatalogTab active />)
    const row = screen.getByTestId('category-request-req-1')
    await user.click(within(row).getByRole('button', { name: /^Reject/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Note to the supplier/), 'Use Mushrooms')
    await user.click(within(dialog).getByRole('button', { name: /^Reject$/ }))
    expect(reject).toHaveBeenCalledWith({ id: 'req-1', note: 'Use Mushrooms' })
  })

  it('tree editor adds a category and reorders leaves', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminCatalogTab active />)
    const dept = screen.getByTestId('admin-dept-dept-produce')
    await user.type(within(dept).getByLabelText(/New category in Fresh produce/), 'Herbs')
    await user.click(within(dept).getByRole('button', { name: /^Add$/ }))
    expect(addCategory).toHaveBeenCalledWith({ parentId: 'dept-produce', name: 'Herbs' })

    await user.click(within(dept).getByRole('button', { name: /Move Mushrooms up/ }))
    expect(reorder).toHaveBeenCalledWith({
      parentId: 'dept-produce',
      ids: ['leaf-mush', 'leaf-veg'],
    })
  })
})
