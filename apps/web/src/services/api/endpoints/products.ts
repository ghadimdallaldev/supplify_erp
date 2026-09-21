import { api } from '../base'
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductFilters,
  ProductsResponse,
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
    getProductCategories: builder.query<
      {
        categories: Array<{
          id: string
          supplier_id?: string | null
          name: string
          slug: string
          description?: string
          display_order: number
          product_count?: number
        }>
      },
      void
    >({
      query: () => '/api/products/categories',
      providesTags: ['Product'],
      keepUnusedDataFor: 300,
    }),
    createProductCategory: builder.mutation<
      { category: { id: string; name: string; description?: string } },
      { name: string; description?: string }
    >({
      query: (body) => ({ url: '/api/products/categories', method: 'POST', body }),
      invalidatesTags: ['Product'],
    }),
    updateProductCategory: builder.mutation<
      { category: { id: string; name: string; description?: string } },
      { id: string; name?: string; description?: string | null; is_active?: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/products/categories/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
    deleteProductCategory: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/api/products/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product'],
    }),
    getProductTags: builder.query<{ tags: string[] }, void>({
      query: () => '/api/products/tags',
      providesTags: ['Product'],
      keepUnusedDataFor: 300,
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/api/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
    createProduct: builder.mutation<Product, CreateProductRequest>({
      query: (body) => ({
        url: '/api/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: UpdateProductRequest }>({
      query: ({ id, data }) => ({
        url: `/api/products/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
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
