import { api } from '../base'
import type {
  Supplier,
  SupplierBusinessSettings,
  SupplierFilters,
  SuppliersResponse,
  UpdateSupplierBusinessSettingsRequest,
} from '../../../types'
export const suppliersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSuppliers: builder.query<SuppliersResponse, SupplierFilters>({
      query: (params) => ({
        url: '/api/suppliers',
        params,
      }),
      providesTags: ['Supplier'],
    }),
    getSupplier: builder.query<Supplier, string>({
      query: (id) => `/api/suppliers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
    }),
    getSupplierStatistics: builder.query<
      { totalOrders: number; totalSpent: number; averageOrderValue: number },
      string
    >({
      query: (id) => `/api/suppliers/${id}/statistics`,
      providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
    }),
    followSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
        'Restaurant',
        'Subscription',
      ],
    }),
    unfollowSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
        'Restaurant',
        'Subscription',
      ],
    }),
    getSupplierMe: builder.query<{ supplier: Supplier }, void>({
      query: () => '/api/suppliers/me',
      providesTags: ['Supplier'],
      keepUnusedDataFor: 300,
    }),
    getSupplierBusinessSettings: builder.query<{ business: SupplierBusinessSettings }, void>({
      query: () => '/api/suppliers/me/business',
      providesTags: ['Supplier'],
    }),
    updateSupplierBusinessSettings: builder.mutation<
      { business: SupplierBusinessSettings },
      UpdateSupplierBusinessSettingsRequest
    >({
      query: (body) => ({
        url: '/api/suppliers/me/business',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Supplier'],
    }),
    updateSupplier: builder.mutation<Supplier, { id: string; data: Partial<Supplier> }>({
      query: ({ id, data }) => ({
        url: `/api/suppliers/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    uploadSupplierLogo: builder.mutation<Supplier, { id: string; logoUrl: string }>({
      query: ({ id, logoUrl }) => ({
        url: `/api/suppliers/${id}/logo`,
        method: 'POST',
        body: { logoUrl },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    getPresignedUrl: builder.mutation<
      { presignedUrl: string; fileKey: string; fileName: string; fileType: string },
      { fileName: string; fileType: string; fileSize?: number }
    >({
      query: (body) => ({
        url: '/api/files/presign',
        method: 'POST',
        body,
      }),
    }),
    blockSupplier: builder.mutation<{ message: string }, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/api/suppliers/${id}/block`,
        method: 'POST',
        body: reason ? { reason } : {},
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    unblockSupplier: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/block`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    getSupplierCustomDomain: builder.query<
      {
        allowed: boolean
        customDomain: {
          hostname: string
          verifiedAt: string | null
          sslStatus: string
          enabled: boolean
        } | null
      },
      void
    >({
      query: () => '/api/suppliers/me/custom-domain',
      providesTags: ['Supplier'],
    }),
    updateSupplierCustomDomain: builder.mutation<
      {
        customDomain: {
          hostname: string
          verifiedAt: string | null
          sslStatus: string
          enabled: boolean
          verificationInstructions?: {
            txtRecord: { name: string; value: string }
            cnameRecord: { name: string; value: string }
            note: string
          }
        }
      },
      { hostname: string }
    >({
      query: (body) => ({
        url: '/api/suppliers/me/custom-domain',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Supplier'],
    }),
    verifySupplierCustomDomain: builder.mutation<
      {
        customDomain: {
          hostname: string
          verifiedAt: string | null
          sslStatus: string
          enabled: boolean
        }
      },
      void
    >({
      query: () => ({
        url: '/api/suppliers/me/custom-domain/verify',
        method: 'POST',
      }),
      invalidatesTags: ['Supplier'],
    }),
  }),
})
