/**
 * Admin impersonation: effective tenant role for UI and API skip logic.
 */
import { useAppSelector } from './redux'
import { useGetImpersonationStatusQuery } from '../services/api'
import type { User } from '../types'

export type EffectiveTenantRole = User['role'] | null

export function useImpersonation() {
  const { user } = useAppSelector((state) => state.auth)
  const isPlatformAdmin = user?.role === 'ADMIN'
  const {
    data: impersonation,
    isLoading,
    refetch,
  } = useGetImpersonationStatusQuery(undefined, {
    skip: !isPlatformAdmin,
  })

  /** /auth/me includes tenant permissions + workspace while the impersonation cookie is active. */
  const impersonatingFromMe = Boolean(
    isPlatformAdmin &&
      user?.workspace?.tenantType &&
      Array.isArray(user.tenantPermissions) &&
      user.tenantPermissions.length > 0
  )

  const isImpersonating = Boolean(isPlatformAdmin && (impersonation?.active || impersonatingFromMe))
  const effectiveTenantType =
    isImpersonating && (impersonation?.tenantType ?? user?.workspace?.tenantType)
      ? ((impersonation?.tenantType ?? user?.workspace?.tenantType) as 'RESTAURANT' | 'SUPPLIER')
      : null

  /** Role for nav, pages, and feature gates — impersonated tenant type when active. */
  const effectiveRole: EffectiveTenantRole = isImpersonating
    ? effectiveTenantType
    : (user?.role ?? null)

  const isEffectiveRestaurant = effectiveRole === 'RESTAURANT'
  const isEffectiveSupplier = effectiveRole === 'SUPPLIER'
  const isEffectiveTenant = isEffectiveRestaurant || isEffectiveSupplier

  /** Fetch tenant entitlements (skip when admin is not impersonating). */
  const shouldLoadTenantEntitlements = Boolean(user?.id && (isEffectiveTenant || !isPlatformAdmin))

  return {
    user,
    impersonation,
    isLoading,
    refetch,
    isPlatformAdmin,
    isImpersonating,
    effectiveRole,
    effectiveTenantType,
    isEffectiveRestaurant,
    isEffectiveSupplier,
    isEffectiveTenant,
    shouldLoadTenantEntitlements,
    tenantId: impersonation?.tenantId ?? user?.workspace?.tenantId ?? null,
    tenantName: impersonation?.tenantName ?? user?.workspace?.tenantName ?? null,
  }
}
