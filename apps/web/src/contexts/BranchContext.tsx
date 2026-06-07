import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import {
  useGetBranchesQuery,
  useGetOrgBranchesQuery,
  useGetRestaurantOrgBranchesQuery,
  useSwitchBranchAccountMutation,
  useSwitchOrgBranchContextMutation,
  useSwitchRestaurantOrgBranchContextMutation,
  api,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { useImpersonation } from '../hooks/useImpersonation'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { multiBranchEnabled } from '../lib/planLimits'
import { useAppDispatch } from '../hooks/redux'

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
  const { isEffectiveTenant, isEffectiveSupplier, isEffectiveRestaurant } = useImpersonation()
  const isTenantUser = isEffectiveTenant
  const isSupplier = isEffectiveSupplier
  const isRestaurant = isEffectiveRestaurant
  const { isDriverRole } = useWorkspaceRole()
  const { entitlements } = useEntitlements()
  const multiBranchFeature = multiBranchEnabled(entitlements)

  const {
    data: supplierOrgData,
    isLoading: supplierOrgLoading,
    isError: supplierOrgError,
  } = useGetOrgBranchesQuery(undefined, { skip: !isSupplier || isDriverRole })

  const {
    data: restaurantOrgData,
    isLoading: restaurantOrgLoading,
    isError: restaurantOrgError,
  } = useGetRestaurantOrgBranchesQuery(undefined, { skip: !isRestaurant })

  const useSupplierOrgBranches =
    isSupplier && !supplierOrgError && Boolean(supplierOrgData?.organizationId)

  const useRestaurantOrgBranches =
    isRestaurant && !restaurantOrgError && Boolean(restaurantOrgData?.organizationId)

  const useOrgBranches = useSupplierOrgBranches || useRestaurantOrgBranches

  const { data: linkedData, isLoading: linkedLoading } = useGetBranchesQuery(undefined, {
    skip: !isTenantUser || useOrgBranches,
  })
  const [switchBranchAccount, { isLoading: isSwitchingLinked }] = useSwitchBranchAccountMutation()
  const [switchSupplierOrgBranch, { isLoading: isSwitchingSupplierOrg }] =
    useSwitchOrgBranchContextMutation()
  const [switchRestaurantOrgBranch, { isLoading: isSwitchingRestaurantOrg }] =
    useSwitchRestaurantOrgBranchContextMutation()

  const orgData = useSupplierOrgBranches ? supplierOrgData : restaurantOrgData
  const isLoading = useOrgBranches
    ? useSupplierOrgBranches
      ? supplierOrgLoading
      : restaurantOrgLoading
    : linkedLoading
  const isSwitching = useOrgBranches
    ? useSupplierOrgBranches
      ? isSwitchingSupplierOrg
      : isSwitchingRestaurantOrg
    : isSwitchingLinked

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
    ? useSupplierOrgBranches
      ? (supplierOrgData?.activeSupplierId ?? null)
      : (restaurantOrgData?.activeRestaurantId ?? null)
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

  const switchAccount = useCallback(
    async (accountId: string | null) => {
      if (useOrgBranches) {
        if (useSupplierOrgBranches) {
          await switchSupplierOrgBranch({ supplier_id: accountId }).unwrap()
        } else {
          await switchRestaurantOrgBranch({ restaurant_id: accountId }).unwrap()
        }
      } else {
        const tenantType = isSupplier ? 'SUPPLIER' : 'RESTAURANT'
        await switchBranchAccount({
          tenantId: accountId,
          tenantType: accountId ? tenantType : undefined,
        }).unwrap()
      }
      dispatch(api.util.resetApiState())
      window.location.reload()
    },
    [
      dispatch,
      switchBranchAccount,
      switchSupplierOrgBranch,
      switchRestaurantOrgBranch,
      useOrgBranches,
      useSupplierOrgBranches,
      isSupplier,
    ]
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
