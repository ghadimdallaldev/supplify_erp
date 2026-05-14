import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import {
  useGetBranchesQuery,
  useSwitchBranchAccountMutation,
  api,
} from '../services/api'
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
  switchAccount: (accountId: string | null) => Promise<void>
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined)

export function BranchProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const isTenantUser = user?.role === 'RESTAURANT' || user?.role === 'SUPPLIER'
  const { data, isLoading, refetch } = useGetBranchesQuery(undefined, { skip: !isTenantUser })
  const [switchBranchAccount, { isLoading: isSwitching }] = useSwitchBranchAccountMutation()

  const accounts = (data?.accounts ?? data?.branches ?? []) as LinkedAccountRecord[]
  const activeAccountId = data?.activeAccountId ?? data?.primaryAccountId ?? null
  const primaryAccount =
    accounts.find((account) => account.isPrimary) ??
    (data?.primaryAccountId
      ? accounts.find((account) => account.id === data.primaryAccountId) ?? null
      : accounts[0] ?? null)

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? primaryAccount,
    [accounts, activeAccountId, primaryAccount],
  )

  useEffect(() => {
    if (!isTenantUser) return
    refetch()
  }, [isTenantUser, refetch])

  const switchAccount = useCallback(
    async (accountId: string | null) => {
      const tenantType = user?.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
      await switchBranchAccount({
        tenantId: accountId,
        tenantType: accountId ? tenantType : undefined,
      }).unwrap()
      dispatch(api.util.resetApiState())
      window.location.reload()
    },
    [dispatch, switchBranchAccount, user?.role],
  )

  const value = useMemo(
    () => ({
      accounts,
      primaryAccount,
      activeAccountId,
      activeAccount,
      isLoading,
      isSwitching,
      switchAccount,
    }),
    [
      accounts,
      primaryAccount,
      activeAccountId,
      activeAccount,
      isLoading,
      isSwitching,
      switchAccount,
    ],
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
