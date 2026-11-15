import { apiUrl } from '../../config/env'
import type { ApiEnvelope } from '../../types/supplify'
import {
  getAccessToken,
  getActiveTenantToken,
  getRefreshToken,
  clearTokens,
} from '../../features/auth/tokenStorage'
import { refreshMobileTokens } from '../../features/auth/keycloakAuth'
import {
  assertRequestScope,
  getRequestScopeVersion,
  registerScopedRequest,
} from '../../features/auth/requestScope'

export class ApiError extends Error {
  status: number
  name: string
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.name = code
    this.details = details
  }
}

/** Boost / featured ad charge required — must not lock the whole account. */
export class PaymentRequiredError extends ApiError {
  amount?: number
  invoiceId?: string
  pricingKey?: string
  paymentData?: Record<string, unknown>

  constructor(
    message: string,
    opts: {
      code?: string
      amount?: number
      invoiceId?: string
      pricingKey?: string
      paymentData?: Record<string, unknown>
    } = {}
  ) {
    super(402, opts.code || 'PAYMENT_REQUIRED', message)
    this.name = opts.code || 'PAYMENT_REQUIRED'
    this.amount = opts.amount
    this.invoiceId = opts.invoiceId
    this.pricingKey = opts.pricingKey
    this.paymentData = opts.paymentData
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  headers?: Record<string, string>
  timeoutMs?: number
}

type ApiAuthStateListener = (status: 401 | 402) => void

let refreshPromise: { scope: number; promise: Promise<boolean> } | null = null
let authStateListener: ApiAuthStateListener | null = null

export function setApiAuthStateListener(listener: ApiAuthStateListener | null) {
  authStateListener = listener
  return () => {
    if (authStateListener === listener) authStateListener = null
  }
}

function isPromotionPaymentRequired(json: ApiEnvelope<unknown>): boolean {
  const data = (json.data || {}) as Record<string, unknown>
  const errName = json.error?.name || ''
  if (data.paymentRequired === true) return true
  return [
    'PAYMENT_REQUIRED',
    'PAYMENT_FAILED',
    'PROMOTION_AD_PAYMENT_REQUIRED',
    'PROMOTION_AD_PAYMENT_FAILED',
  ].includes(errName)
}

async function tryRefresh(scope: number): Promise<boolean> {
  if (refreshPromise?.scope === scope) return refreshPromise.promise
  const pending = (async () => {
    try {
      const refreshToken = await getRefreshToken()
      assertRequestScope(scope)
      if (!refreshToken) return false
      await refreshMobileTokens(refreshToken)
      return true
    } catch {
      return false
    } finally {
      if (refreshPromise?.scope === scope) refreshPromise = null
    }
  })()
  refreshPromise = { scope, promise: pending }
  return pending
}

function friendlyAuthMessage(code: string, fallback: string): string {
  if (code === 'JWT_EXPIRED') return 'Your session expired. Please sign in again.'
  return fallback
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {}, timeoutMs = 15_000 } = options
  const scope = getRequestScopeVersion()
  const checkScope = () => {
    if (!auth) return
    try {
      assertRequestScope(scope)
    } catch {
      throw new ApiError(
        0,
        'SESSION_CHANGED',
        'Your account or workspace changed. Please try again.'
      )
    }
  }
  const url = `${apiUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    }
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
    if (method !== 'GET' && method !== 'HEAD') {
      requestHeaders['X-Requested-With'] = 'Supplify'
    }
    if (auth) {
      const token = await getAccessToken()
      if (token) requestHeaders.Authorization = `Bearer ${token}`
      const tenant = await getActiveTenantToken()
      if (tenant) requestHeaders['X-Active-Tenant-Token'] = tenant
    }
    checkScope()
    return requestHeaders
  }

  const doFetch = async () => {
    const controller = new AbortController()
    const unregister = auth ? registerScopedRequest(controller) : () => {}
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method,
        headers: await buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      checkScope()
      return response
    } catch (error) {
      checkScope()
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(0, 'TIMEOUT', 'The request took too long. Please try again.')
      }
      throw error
    } finally {
      clearTimeout(timeout)
      unregister()
    }
  }

  let response = await doFetch()

  if (response.status === 401 && auth) {
    const refreshed = await tryRefresh(scope)
    checkScope()
    if (refreshed) response = await doFetch()
  }

  let json: ApiEnvelope<T>
  try {
    json = await response.json()
  } catch {
    checkScope()
    throw new ApiError(response.status, 'PARSE_ERROR', 'Invalid server response')
  }
  checkScope()

  if (response.status === 401) {
    if (auth) {
      await clearTokens()
      checkScope()
      authStateListener?.(401)
    }
    const code = json.error?.name ?? 'UNAUTHORIZED'
    throw new ApiError(
      401,
      code,
      friendlyAuthMessage(code, json.error?.message ?? 'Session expired')
    )
  }
  if (response.status === 402) {
    if (isPromotionPaymentRequired(json)) {
      const data = (json.data || {}) as Record<string, unknown>
      throw new PaymentRequiredError(
        json.error?.message ?? data.message?.toString() ?? 'Payment required',
        {
          code: json.error?.name || 'PAYMENT_REQUIRED',
          amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || undefined,
          invoiceId: typeof data.invoiceId === 'string' ? data.invoiceId : undefined,
          pricingKey: typeof data.pricingKey === 'string' ? data.pricingKey : undefined,
          paymentData: data,
        }
      )
    }
    authStateListener?.(402)
    throw new ApiError(402, 'ACCOUNT_LOCKED', json.error?.message ?? 'Account locked')
  }
  if (response.status === 403) {
    throw new ApiError(403, json.error?.name ?? 'FORBIDDEN', json.error?.message ?? 'Access denied')
  }
  if (!response.ok || !json.ok) {
    throw new ApiError(
      response.status,
      json.error?.name ?? 'API_ERROR',
      json.error?.message ?? 'Request failed',
      json.error && 'details' in json.error
        ? (json.error as { details?: unknown }).details
        : undefined
    )
  }

  return json.data
}

export const api = {
  get: <T>(path: string, auth = true) => apiRequest<T>(path, { auth }),
  post: <T>(path: string, body?: unknown, auth = true, headers?: Record<string, string>) =>
    apiRequest<T>(path, { method: 'POST', body, auth, headers }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    apiRequest<T>(path, { method: 'PUT', body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    apiRequest<T>(path, { method: 'PATCH', body, auth }),
  delete: <T>(path: string, body?: unknown, auth = true) =>
    apiRequest<T>(path, { method: 'DELETE', body, auth }),
}
