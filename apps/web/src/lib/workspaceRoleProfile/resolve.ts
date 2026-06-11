import type { PermissionCheck, WorkspacePersonaId, WorkspacePersonaProfile } from './shared'
import { GENERIC_PROFILE } from './shared'
import { SUPPLIER_PROFILES, resolveSupplierPersonaId } from './supplier'
import { RESTAURANT_PROFILES, resolveRestaurantPersonaId } from './restaurant'

function getWorkspaceProfile(id: WorkspacePersonaId): WorkspacePersonaProfile {
  const supplier = SUPPLIER_PROFILES[id as keyof typeof SUPPLIER_PROFILES]
  if (supplier) return supplier as WorkspacePersonaProfile
  const restaurant = RESTAURANT_PROFILES[id as keyof typeof RESTAURANT_PROFILES]
  if (restaurant) return restaurant as WorkspacePersonaProfile
  return GENERIC_PROFILE
}

export function resolveWorkspacePersona(input: {
  tenantType: 'SUPPLIER' | 'RESTAURANT' | null | undefined
  roleName: string | null | undefined
  can: PermissionCheck
  isDriver?: boolean
}): WorkspacePersonaProfile {
  const { tenantType, roleName, can, isDriver = false } = input
  let id: WorkspacePersonaId = 'generic'
  if (tenantType === 'SUPPLIER') {
    id = resolveSupplierPersonaId(roleName ?? null, can, isDriver)
  } else if (tenantType === 'RESTAURANT') {
    id = resolveRestaurantPersonaId(roleName ?? null, can)
  }
  return getWorkspaceProfile(id)
}
