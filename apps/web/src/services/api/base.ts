import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { resolveUpgradeUrl } from '../../lib/externallyControlledFeatures'
import { getApiBase } from '../../lib/env'
import { refreshAuthSession, stopAuthSessionRefresh } from '../../lib/authSessionRefresh'

const API_URL = getApiBase()

type ApiErrorBody = { error?: { name?: string; message?: string } }

function requestPath(args: unknown): string {
  if (typeof args === 'string') return args
  if (args && typeof args === 'object' && 'url' in args) {
    return String((args as { url: string }).url)
  }
  return ''
}

/** True when the user had a session that is no longer valid (not merely "never logged in"). */
function isSessionExpiredAuthError(error: ApiErrorBody['error']): boolean {
  if (!error?.name) return false
  if (error.name === 'JWT_EXPIRED') return true
  if (error.name === 'AUTH_TEMPORARILY_UNAVAILABLE') return false
  if (error.name !== 'UNAUTHORIZED') return false
  const msg = (error.message || '').toLowerCase()
  return msg.includes('expired') || msg.includes('refresh failed') || msg.includes('invalid token')
}

function redirectToLoginForAuthError(error: ApiErrorBody['error'], requestUrl: string): void {
  if (typeof window === 'undefined' || window.location.pathname.includes('/login')) {
    return
  }
  // AuthGuard already sends unauthenticated users to /login without a full reload.
  if (requestUrl === '/auth/me' && !isSessionExpiredAuthError(error)) {
    return
  }
  stopAuthSessionRefresh()
  const suffix = isSessionExpiredAuthError(error) ? '?expired=true' : ''
  window.location.href = `/login${suffix}`
}

function sanitizePlanLabel(value: unknown): string {
  const raw = String(value || '').trim()
  const key = raw.toLowerCase()
  if (key === 'silver' || key === 'bronze') return 'Growth'
  if (key === 'gold' || key === 'platinum') return 'Scale'
  if (key === 'free' || key === 'free trial') return '30-day Free Trial'
  return raw
}

function sanitizeRecommendedPlans(value: unknown): string[] {
  const source = Array.isArray(value) ? value : ['Scale']
  return source.map(sanitizePlanLabel).filter(Boolean)
}

// Custom baseQuery to unwrap API response envelope
const baseQueryWithUnwrap = async (args: any, api: any, extraOptions: any) => {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
    prepareHeaders: (headers) => {
      headers.set('X-Requested-With', 'Supplify')
      return headers
    },
  })

  let result = await rawBaseQuery(args, api, extraOptions)

  const requestUrl = requestPath(args)

  // Network / offline: do not treat as logout
  if (result.error && result.error.status === 'FETCH_ERROR') {
    return result
  }

  const firstErr = result.error as { status?: number | string; data?: unknown } | undefined
  if (firstErr?.status === 503) {
    const errorData = firstErr.data
    if (typeof errorData === 'object' && errorData !== null) {
      const apiError = (errorData as ApiErrorBody).error
      if (apiError?.name === 'AUTH_TEMPORARILY_UNAVAILABLE') {
        return result
      }
    }
  }

  // 401 fallback: single-flight cookie refresh then retry once
  if (firstErr?.status === 401 && requestUrl !== '/auth/refresh' && requestUrl !== '/auth/logout') {
    const errorData = firstErr.data
    const apiError =
      typeof errorData === 'object' && errorData !== null
        ? (errorData as ApiErrorBody).error
        : undefined
    if (apiError?.name === 'UNAUTHORIZED' || apiError?.name === 'JWT_EXPIRED') {
      const refreshed = await refreshAuthSession('fallback')
      if (refreshed.ok) {
        result = await rawBaseQuery(args, api, extraOptions)
      } else if (refreshed.reason === 'transient') {
        return {
          error: {
            status: 503,
            data: {
              ok: false,
              error: {
                name: 'AUTH_TEMPORARILY_UNAVAILABLE',
                message: 'Authentication service temporarily unavailable',
              },
            },
          },
        }
      } else {
        redirectToLoginForAuthError(apiError, requestUrl)
        return { ...result }
      }
    }
  }

  // Handle remaining 401 - distinguish "not logged in" from "session expired"
  const err = result.error as { status?: number | string; data?: unknown } | undefined
  if (err?.status === 401) {
    const errorData = err.data
    if (typeof errorData === 'object' && errorData !== null) {
      const apiError = (errorData as ApiErrorBody).error
      if (apiError?.name === 'UNAUTHORIZED' || apiError?.name === 'JWT_EXPIRED') {
        redirectToLoginForAuthError(apiError, requestUrl)
        return { ...result }
      }
    }
  }

  // Unwrap the API response envelope { ok: true/false, data: ..., error: ... }
  const data = result.data as
    | { ok?: boolean; data?: unknown; error?: { name?: string } }
    | undefined
  if (data && typeof data === 'object' && 'ok' in data) {
    if (data.ok) {
      // Return the actual data
      return { ...result, data: data.data }
    } else {
      if (data.error?.name === 'UNAUTHORIZED' || data.error?.name === 'JWT_EXPIRED') {
        redirectToLoginForAuthError(data.error, requestUrl)
      }
      // Dispatch monetization soft-wall when blocked by plan/limit (Phase B)
      const respErr = data.error
      if (respErr?.name === 'ACCOUNT_LOCKED') {
        try {
          const details = (respErr as { details?: { pendingActivation?: boolean } }).details
          if (details?.pendingActivation) {
            if (
              typeof window !== 'undefined' &&
              !window.location.pathname.startsWith('/app/activate')
            ) {
              window.location.href = '/app/activate'
            }
          } else {
            const { openPayOverdueModal } = await import(
              /* @vite-ignore */ '../../features/billing/billingSlice'
            )
            api.dispatch(openPayOverdueModal())
          }
        } catch {
          void 0
        }
      }
      if (
        respErr?.name === 'LIMIT_EXCEEDED' ||
        respErr?.name === 'FEATURE_NOT_AVAILABLE' ||
        respErr?.name === 'BRANCH_LIMIT_REACHED'
      ) {
        try {
          const { showMonetizationBlock } = await import(
            /* @vite-ignore */ '../../features/monetization/monetizationSlice'
          )
          const details = (respErr as { details?: Record<string, unknown> }).details || {}
          const userRole = (api.getState() as { auth?: { user?: { role?: string } } })?.auth?.user
            ?.role
          const isLimit =
            respErr.name === 'LIMIT_EXCEEDED' || respErr.name === 'BRANCH_LIMIT_REACHED'
          const normalizedUpgradeUrl = resolveUpgradeUrl(
            details.upgradeUrl as string | undefined,
            (details.tenantType as string | undefined) ?? null,
            userRole
          )
          api.dispatch(
            showMonetizationBlock({
              type: isLimit ? 'limit' : 'feature',
              payload: (isLimit
                ? {
                    limitKey: (details.limitKey as string) || 'branches',
                    limitValue: Number(details.limitValue ?? details.limit ?? 0),
                    currentUsage: Number(details.currentUsage ?? details.current ?? 0),
                    currentPlan: details.currentPlan
                      ? sanitizePlanLabel(details.currentPlan)
                      : null,
                    recommendedPlans: sanitizeRecommendedPlans(details.recommendedPlans),
                    upgradeUrl: normalizedUpgradeUrl,
                  }
                : {
                    ...details,
                    currentPlan: details.currentPlan
                      ? sanitizePlanLabel(details.currentPlan)
                      : null,
                    requiredPlan: details.requiredPlan
                      ? sanitizePlanLabel(details.requiredPlan)
                      : null,
                    recommendedPlans: sanitizeRecommendedPlans(details.recommendedPlans),
                    upgradeUrl: normalizedUpgradeUrl,
                  }) as
                | import('../../features/monetization/monetizationSlice').LimitExceededPayload
                | import('../../features/monetization/monetizationSlice').FeatureNotAvailablePayload,
            })
          )
        } catch {
          // Ignore dynamic import or dispatch errors for monetization block
          void 0
        }
      }
      return { ...result, error: { status: 'CUSTOM_ERROR', data: respErr } }
    }
  }

  return result
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithUnwrap as any,
  tagTypes: [
    'User',
    'RegisterStatus',
    'Product',
    'ProductList',
    'ProductFavorite',
    'SearchHistory',
    'Order',
    'Supplier',
    'Restaurant',
    'Branding',
    'Price',
    'Inventory',
    'RestaurantInventory',
    'RestaurantWaste',
    'Chat',
    'Receiving',
    'RestaurantFinance',
    'Notification',
    'NotificationWebhook',
    'Branch',
    'BranchInvitations',
    'RestaurantInvitations',
    'RestaurantOrg',
    'Org',
    'RestaurantTeam',
    'Subscription',
    'Billing',
    'Admin',
    'AdminFeatureFlags',
    'AdminTenantFeatures',
    'Reservation',
    'OrdersCalendar',
    'QuickList',
    'Fulfillment',
    'SupplierOps',
    'Driver',
    'Reviews',
    'Reports',
    'Disputes',
    'Promotions',
    'ContractPricing',
    'QuoteRequest',
    'Audit',
    'TenantRoles',
    'Amendments',
    'CreditNotes',
    'StaffMember',
    'StaffShift',
    'StaffTimeEntry',
    'StaffPto',
    'StaffAvailability',
    'StaffSwap',
    'StaffAnnouncement',
    'StaffDocument',
    'StaffIncident',
    'StaffPerformance',
    'StaffPayroll',
    'ConsumerMenu',
    'ConsumerOrder',
    'ConsumerFulfillment',
    'ConsumerAuth',
    'ConsumerLoyaltyProgram',
    'Recipe',
    'RecipeCosting',
    'RecipeImpact',
    'SupplierLoyaltyProgram',
    'SupplierGrowth',
  ],
  keepUnusedDataFor: 120,
  refetchOnFocus: false,
  endpoints: () => ({}),
})
