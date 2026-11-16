import type { User } from '../types'
export function businessSessionKey(user: User | null | undefined): string | null {
  return user
    ? JSON.stringify([
        user.id,
        user.role,
        user.workspace?.tenantId ?? null,
        [...(user.tenantRoles ?? [])].sort(),
        [...(user.tenantPermissions ?? [])].sort(),
        user.warehouseAccess?.mode ?? null,
        [...(user.warehouseAccess?.warehouseIds ?? [])].sort(),
      ])
    : null
}
