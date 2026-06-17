import type { User } from '../types'

/** Named + legacy owner role identifiers returned by /auth/me tenantRoles / workspace.roleName */
export const TENANT_OWNER_ROLE_NAMES = [
  'Owner',
  'Org Owner',
  'RESTAURANT_OWNER',
  'SUPPLIER_OWNER',
] as const

export function isTenantOwner(user: User | null | undefined): boolean {
  if (!user) return false
  const roles = user.tenantRoles ?? []
  const workspaceRole = user.workspace?.roleName
  if (TENANT_OWNER_ROLE_NAMES.some((name) => roles.includes(name))) return true
  if (
    workspaceRole &&
    TENANT_OWNER_ROLE_NAMES.includes(workspaceRole as (typeof TENANT_OWNER_ROLE_NAMES)[number])
  ) {
    return true
  }
  return false
}

/** Supplier customer growth nav/API — owners always; others need growth permissions. */
export function canViewSupplierGrowth(
  user: User | null | undefined,
  can: (key: string) => boolean
): boolean {
  if (isTenantOwner(user)) return true
  return can('GROWTH_VIEW') || can('CUSTOMERS_MANAGE')
}
