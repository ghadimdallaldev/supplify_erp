import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useAppDispatch } from '../hooks/redux'
import {
  consumerApi,
  useConsumerLoginMutation,
  useConsumerLogoutMutation,
  useConsumerSignupMutation,
  useGetConsumerMeQuery,
  type ConsumerLoyaltyLedgerEntry,
  type ConsumerMember,
  type ConsumerMemberOrder,
  type ConsumerLoyaltyProgram,
} from '../services/consumerApi'

type ConsumerAuthContextValue = {
  restaurantSlug: string
  member: ConsumerMember | null
  loyaltyPoints: number
  loyaltyProgram: ConsumerLoyaltyProgram | null
  recentLedger: ConsumerLoyaltyLedgerEntry[]
  recentOrders: ConsumerMemberOrder[]
  isLoading: boolean
  isError: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => void
}

const ConsumerAuthContext = createContext<ConsumerAuthContextValue | null>(null)

export function ConsumerAuthProvider({
  restaurantSlug,
  children,
}: {
  restaurantSlug: string
  children: ReactNode
}) {
  const skip = !restaurantSlug
  const dispatch = useAppDispatch()
  const [signedOutSlug, setSignedOutSlug] = useState<string | null>(null)
  const {
    currentData: data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetConsumerMeQuery(restaurantSlug, {
    skip,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  })
  const [loginMutation] = useConsumerLoginMutation()
  const [signupMutation] = useConsumerSignupMutation()
  const [logoutMutation] = useConsumerLogoutMutation()

  const login = useCallback(
    async (username: string, password: string) => {
      if (!restaurantSlug) return
      await loginMutation({ restaurantSlug, username, password }).unwrap()
      await refetch().unwrap()
      setSignedOutSlug(null)
    },
    [loginMutation, refetch, restaurantSlug]
  )

  const signup = useCallback(
    async (username: string, password: string, displayName?: string) => {
      if (!restaurantSlug) return
      await signupMutation({ restaurantSlug, username, password, displayName }).unwrap()
      await refetch().unwrap()
      setSignedOutSlug(null)
    },
    [refetch, restaurantSlug, signupMutation]
  )

  const logout = useCallback(async () => {
    if (!restaurantSlug) return
    await logoutMutation(restaurantSlug).unwrap()
    setSignedOutSlug(restaurantSlug)
    dispatch(consumerApi.util.invalidateTags([{ type: 'ConsumerAuth', id: restaurantSlug }]))
  }, [dispatch, logoutMutation, restaurantSlug])

  const member = signedOutSlug === restaurantSlug ? null : (data?.member ?? null)

  const value = useMemo<ConsumerAuthContextValue>(
    () => ({
      restaurantSlug,
      member,
      loyaltyPoints: member?.loyaltyPoints ?? 0,
      loyaltyProgram: data?.program ?? null,
      recentLedger: member ? (data?.recentLedger ?? []) : [],
      recentOrders: member ? (data?.recentOrders ?? []) : [],
      isLoading: isLoading || isFetching,
      isError,
      isAuthenticated: Boolean(member),
      login,
      signup,
      logout,
      refreshMe: () => {
        void refetch()
      },
    }),
    [
      data?.recentLedger,
      data?.program,
      data?.recentOrders,
      isFetching,
      isLoading,
      isError,
      login,
      logout,
      member,
      refetch,
      restaurantSlug,
      signup,
    ]
  )

  return <ConsumerAuthContext.Provider value={value}>{children}</ConsumerAuthContext.Provider>
}

export function useConsumerAuth() {
  const ctx = useContext(ConsumerAuthContext)
  if (!ctx) {
    throw new Error('useConsumerAuth must be used within ConsumerAuthProvider')
  }
  return ctx
}

export function useOptionalConsumerAuth() {
  return useContext(ConsumerAuthContext)
}
