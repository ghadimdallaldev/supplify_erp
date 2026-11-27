import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductsPage } from './ProductsPage'
import { renderWithProviders } from '../test/utils'

const mockProducts = vi.fn()
const mockCategories = vi.fn()
const mockTags = vi.fn()
const mockSuppliers = vi.fn()
const mockImportJob = vi.fn()

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isEffectiveSupplier: true,
    isEffectiveRestaurant: false,
    isImpersonating: false,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: false,
  }),
}))

vi.mock('../hooks/useCartActions', () => ({
  useCartActions: () => ({ addItem: vi.fn() }),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetProductsQuery: (...args: unknown[]) => mockProducts(...args),
    useGetProductCategoriesQuery: (...args: unknown[]) => mockCategories(...args),
    useGetProductTagsQuery: (...args: unknown[]) => mockTags(...args),
    useGetSuppliersQuery: (...args: unknown[]) => mockSuppliers(...args),
    useGetWarehousesQuery: () => ({ data: { warehouses: [] }, isLoading: false }),
    useGetEntitlementsQuery: () => ({ data: undefined }),
    useGetActivePromotionsQuery: () => ({ data: { promotions: [] } }),
    useCreateProductMutation: () => [vi.fn(), { isLoading: false }],
    useFavoriteProductMutation: () => [vi.fn()],
    useUnfavoriteProductMutation: () => [vi.fn()],
    useGeneratePresignedUrlMutation: () => [vi.fn(), { isLoading: false }],
    usePreviewProductImportMutation: () => [vi.fn()],
    useExecuteProductImportMutation: () => [vi.fn(), { isLoading: false }],
    useGetProductImportJobQuery: (...args: unknown[]) => mockImportJob(...args),
    useGetShelvesQuery: () => ({ data: { shelves: [] }, isLoading: false }),
    useCreateCategoryRequestMutation: () => [vi.fn(), { isLoading: false }],
  }
})

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCategories.mockReturnValue({ data: { departments: [] }, isLoading: false })
    mockTags.mockReturnValue({ data: { tags: [] }, isLoading: false })
    mockSuppliers.mockReturnValue({ data: { suppliers: [] }, isLoading: false })
    mockImportJob.mockReturnValue({ data: undefined, isFetching: false })
    mockProducts.mockReturnValue({
      data: {
        products: [{ id: 'p1', name: 'Tomatoes', sku: 'TOM-1', supplier_email: 's@test.com' }],
        pagination: { total: 1, limit: 50 },
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    })
  })

  it('renders without temporal-dead-zone import job errors', () => {
    expect(() => renderWithProviders(<ProductsPage />)).not.toThrow()
    expect(screen.getByTestId('products-page')).toBeInTheDocument()
  })

  it('shows supplier catalog products without requiring supplier_email on the payload', () => {
    mockProducts.mockReturnValue({
      data: {
        products: [{ id: 'p1', name: 'Roma Tomatoes 001', sku: 'SKU-1', supplier_id: 'sup-1' }],
        pagination: { total: 500, limit: 50 },
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<ProductsPage />)
    expect(screen.getAllByText('Roma Tomatoes 001').length).toBeGreaterThan(0)
    expect(screen.queryByText(/No products in your catalog/i)).not.toBeInTheDocument()
  })

  it('banners products that need a category and filters to them', async () => {
    const list = {
      products: [{ id: 'p1', name: 'Zqxv wheel', sku: 'ZQ-1', category_needs_review: true }],
      pagination: { total: 1, limit: 50 },
    }
    mockProducts.mockImplementation((args: { needsReview?: boolean; limit?: number }) => ({
      data:
        args?.needsReview && args.limit === 1
          ? { products: [], pagination: { total: 3, limit: 1 } }
          : list,
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    }))
    const user = userEvent.setup()
    renderWithProviders(<ProductsPage />)

    expect(screen.getByText(/3 products need a category/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Review them/ }))
    expect(
      await screen.findByRole('button', { name: /Needs a category/, pressed: true })
    ).toBeInTheDocument()
    const listCalls = mockProducts.mock.calls.map((c) => c[0]).filter((a) => a.limit !== 1)
    expect(listCalls.at(-1)).toMatchObject({ needsReview: true })
    expect(screen.queryByRole('button', { name: /Review them/ })).not.toBeInTheDocument()
  })

  it('opens the shelves dialog from the header', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProductsPage />)
    await user.click(screen.getByRole('button', { name: /^Shelves$/ }))
    expect(await screen.findByLabelText(/Shelf name/)).toBeInTheDocument()
  })
})
