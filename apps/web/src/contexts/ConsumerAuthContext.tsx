import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import {
  consumerApi,
  useConsumerLoginMutation,
  useConsumerLogoutMutation,
  useConsumerSignupMutation,
  useGetConsumerMeQuery,
  type ConsumerLoyaltyLedgerEntry,
  type ConsumerMember,
  type ConsumerMemberOrder,
} from '../services/consumerApi'

type ConsumerAuthContextValue = {
  restaurantSlug: string
  member: ConsumerMember | null
  loyaltyPoints: number
  recentLedger: ConsumerLoyaltyLedgerEntry[]
  recentOrders: ConsumerMemberOrder[]
  isLoading: boolean
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
  const { data, isLoading, isFetching, refetch } = useGetConsumerMeQuery(restaurantSlug, {
    skip,
  })
  const [loginMutation] = useConsumerLoginMutation()
  const [signupMutation] = useConsumerSignupMutation()
  const [logoutMutation] = useConsumerLogoutMutation()

  const login = useCallback(
    async (username: string, password: string) => {
      if (!restaurantSlug) return
      await loginMutation({ restaurantSlug, username, password }).unwrap()
      refetch()
    },
    [loginMutation, refetch, restaurantSlug]
  )

  const signup = useCallback(
    async (username: string, password: string, displayName?: string) => {
      if (!restaurantSlug) return
      await signupMutation({ restaurantSlug, username, password, displayName }).unwrap()
      refetch()
    },
    [refetch, restaurantSlug, signupMutation]
  )

  const logout = useCallback(async () => {
    if (!restaurantSlug) return
    await logoutMutation(restaurantSlug).unwrap()
    consumerApi.util.invalidateTags([{ type: 'ConsumerAuth', id: restaurantSlug }])
  }, [logoutMutation, restaurantSlug])

  const member = data?.member ?? null

  const value = useMemo<ConsumerAuthContextValue>(
    () => ({
      restaurantSlug,
      member,
      loyaltyPoints: member?.loyaltyPoints ?? 0,
      recentLedger: data?.recentLedger ?? [],
      recentOrders: data?.recentOrders ?? [],
      isLoading: isLoading || isFetching,
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
      data?.recentOrders,
      isFetching,
      isLoading,
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
