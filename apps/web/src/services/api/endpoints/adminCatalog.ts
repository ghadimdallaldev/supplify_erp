import { api } from '../base'
import type { CategoryNode, CategoryRequest, CategoryRequestStatus } from '../../../types'

/** Admin: platform category tree editing and supplier category requests. */
export const adminCatalogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAdminCategoryRequests: builder.query<
      { requests: CategoryRequest[] },
      { status?: CategoryRequestStatus } | void
    >({
      query: (params) => ({ url: '/api/admin/category-requests', params: params ?? {} }),
      providesTags: ['AdminCategoryRequest'],
    }),
    /** Creates a new leaf (optionally under another department) and moves the products. */
    approveCategoryRequest: builder.mutation<
      { request: CategoryRequest; category: CategoryNode; movedProducts: number },
      {
        id: string
        parentId?: string
        name?: string
        name_ar?: string
        name_fr?: string
        aliases?: string[]
        icon_key?: string
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/admin/category-requests/${id}/approve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['AdminCategoryRequest', 'ProductCategory', 'Product'],
    }),
    /** Folds the request into an existing leaf (its name becomes an alias). */
    mergeCategoryRequest: builder.mutation<
      { request: CategoryRequest; category: CategoryNode; movedProducts: number },
      { id: string; categoryId: string }
    >({
      query: ({ id, categoryId }) => ({
        url: `/api/admin/category-requests/${id}/merge`,
        method: 'POST',
        body: { categoryId },
      }),
      invalidatesTags: ['AdminCategoryRequest', 'ProductCategory', 'Product'],
    }),
    rejectCategoryRequest: builder.mutation<
      { request: CategoryRequest },
      { id: string; note?: string }
    >({
      query: ({ id, note }) => ({
        url: `/api/admin/category-requests/${id}/reject`,
        method: 'POST',
        body: note ? { note } : {},
      }),
      invalidatesTags: ['AdminCategoryRequest'],
    }),
    addPlatformCategory: builder.mutation<
      { category: CategoryNode },
      {
        parentId: string
        name: string
        name_ar?: string
        name_fr?: string
        aliases?: string[]
        icon_key?: string
      }
    >({
      query: (body) => ({ url: '/api/admin/categories', method: 'POST', body }),
      invalidatesTags: ['ProductCategory'],
    }),
    updatePlatformCategory: builder.mutation<
      { category: CategoryNode },
      {
        id: string
        name?: string
        name_ar?: string
        name_fr?: string
        aliases?: string[]
        icon_key?: string
      }
    >({
      query: ({ id, ...body }) => ({ url: `/api/admin/categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ProductCategory'],
    }),
    /** `parentId: null` reorders departments; `ids` must be exactly the active siblings. */
    reorderPlatformCategories: builder.mutation<
      { categories: CategoryNode[] },
      { parentId: string | null; ids: string[] }
    >({
      query: (body) => ({ url: '/api/admin/categories/order', method: 'PUT', body }),
      invalidatesTags: ['ProductCategory'],
    }),
  }),
})
