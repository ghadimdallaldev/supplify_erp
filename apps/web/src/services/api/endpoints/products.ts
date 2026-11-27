import { api } from '../base'
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductFilters,
  ProductsResponse,
  CategoryTreeResponse,
  CategorySuggestionsResponse,
  SupplierShelf,
  CategoryRequest,
  CategoryRequestStatus,
  CreateCategoryRequestBody,
} from '../../../types'
export const productsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<ProductsResponse, ProductFilters>({
      query: (params) => ({
        url: '/api/products',
        params,
      }),
      providesTags: ['Product', 'ProductList'],
    }),
    /** Platform category tree (departments → leaf categories) with product counts. */
    getProductCategories: builder.query<CategoryTreeResponse, void>({
      query: () => '/api/products/categories',
      transformResponse: (data: Partial<CategoryTreeResponse> | undefined) => ({
        departments: Array.isArray(data?.departments) ? data.departments : [],
      }),
      providesTags: ['ProductCategory'],
      keepUnusedDataFor: 300,
    }),
    /** Supplier: leaf category suggestions for a product name (top 3, score ≥ 0.6). */
    getCategorySuggestions: builder.query<CategorySuggestionsResponse, { name: string }>({
      query: ({ name }) => ({ url: '/api/products/category-suggestions', params: { name } }),
      keepUnusedDataFor: 120,
    }),
    getShelves: builder.query<{ shelves: SupplierShelf[] }, void>({
      query: () => '/api/products/shelves',
      providesTags: ['Shelf'],
    }),
    createShelf: builder.mutation<{ shelf: SupplierShelf }, { name: string; name_ar?: string }>({
      query: (body) => ({ url: '/api/products/shelves', method: 'POST', body }),
      invalidatesTags: ['Shelf'],
    }),
    updateShelf: builder.mutation<
      { shelf: SupplierShelf },
      { id: string; name?: string; name_ar?: string | null; display_order?: number }
    >({
      query: ({ id, ...body }) => ({ url: `/api/products/shelves/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Shelf'],
    }),
    reorderShelves: builder.mutation<{ shelves: SupplierShelf[] }, { shelfIds: string[] }>({
      query: (body) => ({ url: '/api/products/shelves/order', method: 'PUT', body }),
      invalidatesTags: ['Shelf'],
    }),
    setShelfProducts: builder.mutation<
      { shelf: SupplierShelf },
      { id: string; productIds: string[] }
    >({
      query: ({ id, productIds }) => ({
        url: `/api/products/shelves/${id}/products`,
        method: 'PUT',
        body: { productIds },
      }),
      invalidatesTags: ['Shelf', 'Product'],
    }),
    /** Archives the shelf; 409 SHELF_IN_USE lists the deals and routing rules using it. */
    archiveShelf: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/api/products/shelves/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Shelf', 'Product'],
    }),
    getCategoryRequests: builder.query<
      { requests: CategoryRequest[] },
      { status?: CategoryRequestStatus } | void
    >({
      query: (params) => ({ url: '/api/products/category-requests', params: params ?? {} }),
      providesTags: ['CategoryRequest'],
    }),
    createCategoryRequest: builder.mutation<
      { request: CategoryRequest },
      CreateCategoryRequestBody
    >({
      query: (body) => ({ url: '/api/products/category-requests', method: 'POST', body }),
      invalidatesTags: ['CategoryRequest', 'Product'],
    }),
    getProductTags: builder.query<{ tags: string[] }, void>({
      query: () => '/api/products/tags',
      providesTags: ['Product'],
      keepUnusedDataFor: 300,
    }),
    getProduct: builder.query<{ product: Product }, string>({
      query: (id) => `/api/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
    createProduct: builder.mutation<Product, CreateProductRequest>({
      query: (body) => ({
        url: '/api/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product', 'Shelf', 'ProductCategory'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: UpdateProductRequest }>({
      query: ({ id, data }) => ({
        url: `/api/products/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Product', id },
        'Product',
        'Shelf',
        'ProductCategory',
      ],
    }),
    getProductFavorites: builder.query<{ products: Product[] }, void>({
      query: () => '/api/products/favorites',
      providesTags: ['ProductFavorite'],
    }),
    favoriteProduct: builder.mutation<
      { productId: string; favorited: boolean },
      { productId: string }
    >({
      query: ({ productId }) => ({
        url: '/api/products/favorites',
        method: 'POST',
        body: { productId },
      }),
      async onQueryStarted({ productId }, { dispatch, queryFulfilled, getState }) {
        const patchResults: Array<{ undo: () => void }> = []
        const listArgs = (api.util.selectCachedArgsForQuery as any)(getState(), 'getProducts')
        for (const args of listArgs) {
          patchResults.push(
            dispatch(
              (api.util.updateQueryData as any)('getProducts', args, (draft: ProductsResponse) => {
                const product = draft.products?.find((entry) => entry.id === productId)
                if (product) product.is_favorited = true
              })
            )
          )
        }
        try {
          await queryFulfilled
        } catch {
          patchResults.forEach((patch) => patch.undo())
        }
      },
      invalidatesTags: ['ProductFavorite'],
    }),
    unfavoriteProduct: builder.mutation<{ productId: string; favorited: boolean }, string>({
      query: (productId) => ({
        url: `/api/products/favorites/${productId}`,
        method: 'DELETE',
      }),
      async onQueryStarted(productId, { dispatch, queryFulfilled, getState }) {
        const patchResults: Array<{ undo: () => void }> = []
        const listArgs = (api.util.selectCachedArgsForQuery as any)(getState(), 'getProducts')
        for (const args of listArgs) {
          patchResults.push(
            dispatch(
              (api.util.updateQueryData as any)('getProducts', args, (draft: ProductsResponse) => {
                const product = draft.products?.find((entry) => entry.id === productId)
                if (product) product.is_favorited = false
              })
            )
          )
        }
        try {
          await queryFulfilled
        } catch {
          patchResults.forEach((patch) => patch.undo())
        }
      },
      invalidatesTags: ['ProductFavorite'],
    }),
  }),
})
