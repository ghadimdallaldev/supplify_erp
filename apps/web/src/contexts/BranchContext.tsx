import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import {
  useGetBranchesQuery,
  useGetOrgBranchesQuery,
  useSwitchBranchAccountMutation,
  useSwitchOrgBranchContextMutation,
  api,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { useAppSelector, useAppDispatch } from '../hooks/redux'

export interface LinkedAccountRecord {
  id: string
  name: string
  isPrimary?: boolean
  accountName?: string
  slug?: string
  phone?: string
  contactEmail?: string
}

interface BranchContextValue {
  accounts: LinkedAccountRecord[]
  primaryAccount: LinkedAccountRecord | null
  activeAccountId: string | null
  activeAccount: LinkedAccountRecord | null
  isLoading: boolean
  isSwitching: boolean
  isOrgScope: boolean
  switchAccount: (accountId: string | null) => Promise<void>
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined)

export function BranchProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const isTenantUser = user?.role === 'RESTAURANT' || user?.role === 'SUPPLIER'
  const isSupplier = user?.role === 'SUPPLIER'
  const { entitlements } = useEntitlements()
  const multiBranchFeature = entitlements?.features?.multi_branch === true

  const {
    data: orgData,
    isLoading: orgLoading,
    isError: orgError,
    refetch: refetchOrg,
  } = useGetOrgBranchesQuery(undefined, { skip: !isSupplier })

  const useOrgBranches =
    isSupplier && !orgError && Boolean(orgData?.organizationId) && (orgData?.branches?.length ?? 0) > 0

  const {
    data: linkedData,
    isLoading: linkedLoading,
    refetch: refetchLinked,
  } = useGetBranchesQuery(undefined, { skip: !isTenantUser || useOrgBranches })
  const [switchBranchAccount, { isLoading: isSwitchingLinked }] = useSwitchBranchAccountMutation()
  const [switchOrgBranch, { isLoading: isSwitchingOrg }] = useSwitchOrgBranchContextMutation()

  const data = useOrgBranches ? orgData : linkedData
  const isLoading = useOrgBranches ? orgLoading : linkedLoading
  const isSwitching = useOrgBranches ? isSwitchingOrg : isSwitchingLinked
  const refetch = useOrgBranches ? refetchOrg : refetchLinked

  const rawBranches = useOrgBranches
    ? (orgData?.branches ?? [])
    : (linkedData?.accounts ?? linkedData?.branches ?? [])

  const accounts = rawBranches.map((row) => {
    const account = row as LinkedAccountRecord & { is_main_branch?: boolean }
    return {
      id: account.id,
      name: account.name,
      isPrimary: account.isPrimary ?? account.is_main_branch ?? false,
      accountName: account.accountName,
      slug: account.slug,
      phone: account.phone,
      contactEmail: account.contactEmail,
    }
  }) as LinkedAccountRecord[]

  const activeAccountId = useOrgBranches
    ? (orgData?.activeSupplierId ?? null)
    : (linkedData?.activeAccountId ?? linkedData?.primaryAccountId ?? null)
  const primaryAccount =
    accounts.find((account) => account.isPrimary) ??
    (linkedData?.primaryAccountId
      ? (accounts.find((account) => account.id === linkedData.primaryAccountId) ?? null)
      : (accounts[0] ?? null))

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? primaryAccount,
    [accounts, activeAccountId, primaryAccount]
  )

  useEffect(() => {
    if (!isTenantUser) return
    refetch()
  }, [isTenantUser, refetch])

  const switchAccount = useCallback(
    async (accountId: string | null) => {
      if (useOrgBranches) {
        await switchOrgBranch({ supplier_id: accountId }).unwrap()
      } else {
        const tenantType = user?.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
        await switchBranchAccount({
          tenantId: accountId,
          tenantType: accountId ? tenantType : undefined,
        }).unwrap()
      }
      dispatch(api.util.resetApiState())
      window.location.reload()
    },
    [dispatch, switchBranchAccount, switchOrgBranch, useOrgBranches, user?.role]
  )

  const isOrgScope = useOrgBranches && multiBranchFeature

  const value = useMemo(
    () => ({
      accounts,
      primaryAccount,
      activeAccountId,
      activeAccount,
      isLoading,
      isSwitching,
      isOrgScope,
      switchAccount,
    }),
    [
      accounts,
      primaryAccount,
      activeAccountId,
      activeAccount,
      isLoading,
      isSwitching,
      isOrgScope,
      switchAccount,
    ]
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

/** @deprecated use BranchProvider */
export const AccountSwitchProvider = BranchProvider

export function useBranchContext() {
  const context = useContext(BranchContext)
  if (!context) {
    throw new Error('useBranchContext must be used within BranchProvider')
  }
  return context
}

export function useAccountSwitch() {
  return useBranchContext()
}
