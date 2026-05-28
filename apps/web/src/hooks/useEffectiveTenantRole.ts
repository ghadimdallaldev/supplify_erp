import { useImpersonation, type EffectiveTenantRole } from './useImpersonation'

/** @deprecated Prefer useImpersonation().effectiveRole */
export function useEffectiveTenantRole(): EffectiveTenantRole {
  return useImpersonation().effectiveRole
}
