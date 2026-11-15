import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../client'
import { queryKeys } from './keys'

export type BranchAccount = {
  id: string
  name: string
  accountName?: string | null
  tenantType?: 'RESTAURANT' | 'SUPPLIER'
  isPrimary?: boolean
}

export type BranchAccountsResponse = {
  accounts: BranchAccount[]
  branches: BranchAccount[]
  primaryAccountId: string | null
  activeAccountId: string | null
  tenantType: 'RESTAURANT' | 'SUPPLIER'
}

export type SwitchBranchResponse = {
  activeAccountId: string | null
  tenantName?: string
  tenantType?: 'RESTAURANT' | 'SUPPLIER'
  activeTenantToken: string | null
  cleared?: boolean
}

export type EntitlementValue = boolean | string | number | null

export type MobilePlan = {
  id: string | null
  name: string
  code: string
  tenant_type?: 'RESTAURANT' | 'SUPPLIER'
  price_monthly?: number
  price_yearly?: number
}

export type MobileEntitlements = {
  tenantId: string
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  plan: MobilePlan
  features: Record<string, EntitlementValue>
  featureSources?: Record<string, string>
  limits?: Record<string, number>
  usage?: Record<string, number>
}

type EntitlementsResponse = { entitlements: MobileEntitlements | null }

export function unwrapEntitlements(response: EntitlementsResponse): MobileEntitlements | null {
  return response.entitlements ?? null
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<import('../../../types/supplify').User>('/auth/me'),
    enabled,
  })
}

export function useEntitlements(enabled = true) {
  return useQuery({
    queryKey: queryKeys.entitlements,
    queryFn: async () =>
      unwrapEntitlements(
        await api.get<EntitlementsResponse>('/api/subscriptions/entitlements')
      ),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useBranches(enabled = true) {
  return useQuery({
    queryKey: queryKeys.branches,
    queryFn: () => api.get<BranchAccountsResponse>('/api/branches'),
    enabled,
  })
}

export function useSwitchBranch() {
  return useMutation({
    mutationFn: ({ tenantId, tenantType }: { tenantId: string; tenantType: string }) =>
      api.post<SwitchBranchResponse>('/api/branches/switch', { tenantId, tenantType }),
  })
}
