import { api } from '../base'
import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'
import type { User, AdminUserPreferences } from '../../../types'
export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
      keepUnusedDataFor: 120,
    }),
    getAdminPreferences: builder.query<{ preferences: AdminUserPreferences }, void>({
      query: () => '/auth/admin-preferences',
      providesTags: ['User'],
      keepUnusedDataFor: 300,
    }),
    updateAdminPreferences: builder.mutation<
      { preferences: AdminUserPreferences },
      Partial<AdminUserPreferences>
    >({
      query: (body) => ({
        url: '/auth/admin-preferences',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['User'],
    }),
    getInviteSession: builder.query<
      { id: string; email: string; displayName: string } | null,
      void
    >({
      query: () => '/auth/session',
      keepUnusedDataFor: 0,
    }),
    logout: builder.mutation<{ message?: string; keycloakLogoutUrl?: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),
    getRegisterStatus: builder.query<{ needsSetup: boolean }, void>({
      query: () => '/api/register/status',
      providesTags: ['RegisterStatus'],
      keepUnusedDataFor: 120,
      transformResponse: (response: { needsSetup?: boolean }) => ({
        needsSetup: Boolean(response?.needsSetup),
      }),
    }),
    submitLegalReacceptance: builder.mutation<
      { legalStatus: import('../../../types').LegalAcceptanceStatus },
      LegalAcceptancePayload
    >({
      query: (legalAcceptance) => ({
        url: '/auth/legal-acceptance',
        method: 'POST',
        body: { legalAcceptance },
      }),
      invalidatesTags: ['User'],
    }),
    completeRegistration: builder.mutation<
      { tenantType: string; tenant: unknown },
      {
        accountType: 'RESTAURANT' | 'SUPPLIER'
        businessName: string
        phone?: string
        referralToken?: string
        legalAcceptance: LegalAcceptancePayload
      }
    >({
      query: (body) => ({
        url: '/api/register/complete',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { tenantType?: string; tenant?: unknown }) => ({
        tenantType: response.tenantType as string,
        tenant: response.tenant,
      }),
    }),
  }),
})
