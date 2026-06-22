import { api } from '../base'
import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'
export const branchesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Notification endpoints
    getBranches: builder.query<{ branches: Array<Record<string, unknown>> }, void>({
      query: () => '/api/branches',
      providesTags: ['Branch'],
      keepUnusedDataFor: 300,
    }),
    createBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({
        url: '/api/branches',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch'],
    }),
    updateBranch: builder.mutation<any, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({
        url: `/api/branches/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Branch'],
    }),
    deleteBranch: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/branches/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Branch'],
    }),
    switchBranchAccount: builder.mutation<
      { activeAccountId: string | null; tenantName?: string },
      { tenantId: string | null; tenantType?: string }
    >({
      query: (body) => ({
        url: '/api/branches/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch', 'Restaurant', 'Supplier', 'Order', 'Reservation', 'Notification'],
    }),
    getOrg: builder.query<
      {
        organization: { id: string; name: string }
        orgRole: string
        branches: Array<Record<string, unknown>>
        primarySupplierId: string
      },
      void
    >({
      query: () => '/api/org',
      providesTags: ['Branch', 'Org'],
      keepUnusedDataFor: 300,
    }),
    getOrgBranches: builder.query<
      {
        branches: Array<Record<string, unknown>>
        activeSupplierId: string | null
        organizationId: string
      },
      void
    >({
      query: () => '/api/org/branches',
      providesTags: ['Branch', 'Org'],
      keepUnusedDataFor: 300,
    }),
    createOrgBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({ url: '/api/org/branches', method: 'POST', body }),
      invalidatesTags: ['Branch', 'Org', 'Supplier'],
    }),
    deactivateOrgBranch: builder.mutation<{ deactivated: boolean }, string>({
      query: (supplierId) => ({
        url: `/api/org/branches/${supplierId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Branch', 'Org', 'Supplier'],
    }),
    switchOrgBranchContext: builder.mutation<
      { activeSupplierId: string | null; tenantName?: string },
      { supplier_id: string | null }
    >({
      query: (body) => ({
        url: '/api/org/context/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch', 'Org', 'Restaurant', 'Supplier', 'Order', 'Notification'],
    }),
    getBranchInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      { supplier_id: string }
    >({
      query: ({ supplier_id }) =>
        `/api/org/invitations/roles?supplier_id=${encodeURIComponent(supplier_id)}`,
    }),
    getBranchInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          supplier_id: string
          invited_name?: string
          invited_email?: string
          status: string
          expires_at: string
          created_at: string
          accepted_at?: string
          branch_name: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      { supplier_id?: string } | void
    >({
      query: (params) => {
        const supplierId = params && 'supplier_id' in params ? params.supplier_id : undefined
        return supplierId
          ? `/api/org/invitations?supplier_id=${encodeURIComponent(supplierId)}`
          : '/api/org/invitations'
      },
      providesTags: ['BranchInvitations'],
    }),
    createBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      {
        supplier_id: string
        invited_name?: string
        invited_email?: string
        role_id: string
      }
    >({
      query: (body) => ({ url: '/api/org/invitations', method: 'POST', body }),
      invalidatesTags: ['BranchInvitations'],
    }),
    revokeBranchInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/org/invitations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BranchInvitations'],
    }),
    regenerateBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({ url: `/api/org/invitations/${id}/regenerate`, method: 'POST' }),
      invalidatesTags: ['BranchInvitations'],
    }),
    validateBranchInvite: builder.query<
      {
        valid: boolean
        reason?: string
        branch_name?: string
        org_name?: string
        invited_name?: string
        role_name?: string
        invited_email?: string
        expires_at?: string
      },
      string
    >({
      query: (token) => `/api/public/invitations/branch?token=${encodeURIComponent(token)}`,
    }),
    acceptBranchInvite: builder.mutation<
      { user?: { email?: string; displayName?: string }; activeSupplierId: string },
      {
        token: string
        full_name?: string
        email?: string
        password?: string
        legalAcceptance?: LegalAcceptancePayload
      }
    >({
      query: (body) => ({
        url: '/api/public/invitations/branch/accept',
        method: 'POST',
        body,
      }),
    }),
    validateInvite: builder.query<
      {
        valid: boolean
        reason?: string
        branch_name?: string
        restaurant_name?: string
        org_name?: string
        invited_name?: string
        role_name?: string
        invited_email?: string
        expires_at?: string
      },
      { token: string; type: string }
    >({
      query: ({ token, type }) =>
        `/api/public/invitations?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`,
    }),
    acceptInvite: builder.mutation<
      {
        user?: { email?: string; displayName?: string }
        activeSupplierId?: string
        activeRestaurantId?: string
        needsManualLogin?: boolean
        loginMessage?: string
      },
      {
        token: string
        type: string
        full_name?: string
        email?: string
        password?: string
        legalAcceptance?: LegalAcceptancePayload
      }
    >({
      query: (body) => ({
        url: '/api/public/invitations/accept',
        method: 'POST',
        body,
      }),
    }),
    getRestaurantOrg: builder.query<
      {
        organization: { id: string; name: string }
        orgRole: string
        branches: Array<Record<string, unknown>>
        primaryRestaurantId: string
      },
      void
    >({
      query: () => '/api/restaurant-org',
      providesTags: ['RestaurantOrg', 'Branch'],
      keepUnusedDataFor: 300,
    }),
    getRestaurantOrgBranches: builder.query<
      {
        branches: Array<Record<string, unknown>>
        activeRestaurantId: string | null
        organizationId: string
      },
      void
    >({
      query: () => '/api/restaurant-org/branches',
      providesTags: ['RestaurantOrg', 'Branch'],
      keepUnusedDataFor: 300,
    }),
    createRestaurantOrgBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({ url: '/api/restaurant-org/branches', method: 'POST', body }),
      invalidatesTags: ['RestaurantOrg', 'Branch', 'Restaurant'],
    }),
    switchRestaurantOrgBranchContext: builder.mutation<
      { activeRestaurantId: string | null; tenantName?: string },
      { restaurant_id: string | null }
    >({
      query: (body) => ({
        url: '/api/restaurant-org/context/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantOrg', 'Branch', 'Restaurant', 'Order', 'Notification'],
    }),
    deactivateRestaurantOrgBranch: builder.mutation<{ deactivated: boolean }, string>({
      query: (restaurantId) => ({
        url: `/api/restaurant-org/branches/${restaurantId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantOrg', 'Branch'],
    }),
    getRestaurantMemberInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      void
    >({
      query: () => '/api/restaurants/invitations/members/roles',
    }),
    getRestaurantBranchInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      { restaurant_id: string }
    >({
      query: ({ restaurant_id }) =>
        `/api/restaurants/invitations/branches/roles?restaurant_id=${encodeURIComponent(restaurant_id)}`,
    }),
    getRestaurantMemberInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          invited_name?: string
          invited_email?: string
          status: string
          invitation_type: string
          expires_at: string
          created_at: string
          accepted_at?: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      void
    >({
      query: () => '/api/restaurants/invitations/members',
      providesTags: ['RestaurantInvitations'],
    }),
    createRestaurantMemberInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      { invited_name?: string; invited_email?: string; role_id: string }
    >({
      query: (body) => ({
        url: '/api/restaurants/invitations/members',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    revokeRestaurantMemberInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/restaurants/invitations/members/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    regenerateRestaurantMemberInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({
        url: `/api/restaurants/invitations/members/${id}/regenerate`,
        method: 'POST',
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    getRestaurantBranchInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          restaurant_id: string
          invited_name?: string
          invited_email?: string
          status: string
          expires_at: string
          created_at: string
          accepted_at?: string
          branch_name: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      void
    >({
      query: () => '/api/restaurants/invitations/branches',
      providesTags: ['RestaurantInvitations'],
    }),
    createRestaurantBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      {
        restaurant_id: string
        invited_name?: string
        invited_email?: string
        role_id: string
      }
    >({
      query: (body) => ({
        url: '/api/restaurants/invitations/branches',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    revokeRestaurantBranchInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/restaurants/invitations/branches/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    regenerateRestaurantBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({
        url: `/api/restaurants/invitations/branches/${id}/regenerate`,
        method: 'POST',
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),

    getRestaurantTeam: builder.query<
      {
        team: Array<{
          id: string
          name: string
          email: string
          phone?: string | null
          role: string
          is_primary: boolean
          branch_name?: string | null
        }>
      },
      void
    >({
      query: () => '/api/restaurant-onboarding/team',
      providesTags: ['RestaurantTeam'],
    }),
    addRestaurantTeamMember: builder.mutation<
      { member: Record<string, unknown> },
      { name: string; email: string; phone?: string; role: string; isPrimary?: boolean }
    >({
      query: (body) => ({
        url: '/api/restaurant-onboarding/team',
        method: 'POST',
        body: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          role: body.role,
          isPrimary: body.isPrimary,
        },
      }),
      invalidatesTags: ['RestaurantTeam'],
    }),
    deleteRestaurantTeamMember: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/restaurant-onboarding/team/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantTeam'],
    }),

    getTenantRoles: builder.query<
      {
        roles: Array<{
          id: string
          name: string
          description?: string
          is_system: boolean
          permissions: string[]
          user_count: number
        }>
      },
      void
    >({
      query: () => '/api/roles',
      providesTags: ['TenantRoles'],
      keepUnusedDataFor: 300,
    }),
    getTenantRoleUsers: builder.query<
      {
        users: Array<{
          id: string
          email: string
          display_name: string
          role_id?: string
          role_name?: string
        }>
      },
      void
    >({
      query: () => '/api/roles/users',
      providesTags: ['TenantRoles'],
    }),
    createTenantRole: builder.mutation<
      { role: Record<string, unknown> },
      { name: string; description?: string; permissions: string[] }
    >({
      query: (body) => ({
        url: '/api/roles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    updateTenantRole: builder.mutation<
      { role: Record<string, unknown> },
      { id: string; name?: string; description?: string; permissions?: string[] }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/roles/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    deleteTenantRole: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/roles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    assignTenantUserRole: builder.mutation<
      { userId: string; roleId: string; roleName: string; driverId?: string | null },
      {
        userId: string
        role_id: string
        driver_id?: string | null
        create_driver_profile?: boolean
      }
    >({
      query: ({ userId, role_id, driver_id, create_driver_profile }) => ({
        url: `/api/roles/users/${userId}/assign`,
        method: 'POST',
        body: { role_id, driver_id, create_driver_profile },
      }),
      invalidatesTags: ['TenantRoles', 'User'],
    }),
  }),
})
