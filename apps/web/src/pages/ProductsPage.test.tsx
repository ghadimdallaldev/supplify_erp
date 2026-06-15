import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
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
  }
})

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCategories.mockReturnValue({ data: { categories: [] }, isLoading: false })
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
})
