/**
 * Proactive Keycloak access-token refresh for the web/PWA.
 * Refresh tokens stay HttpOnly — this module only calls POST /auth/refresh with credentials.
 */

import { getApiBase } from './env'

type RefreshSuccess = {
  accessTokenExpiresAt: number | null
  expires_in?: number | null
}

type RefreshOutcome =
  | { ok: true; data: RefreshSuccess }
  | { ok: false; reason: 'invalid' | 'transient' | 'logged_out' | 'disabled' }

const SKEW_MS = 30_000
const LEAD_MIN_MS = 3 * 60_000
const LEAD_MAX_MS = 5 * 60_000
const MIN_DELAY_MS = 15_000
const MAX_TRANSIENT_RETRIES = 3

let timer: ReturnType<typeof setTimeout> | null = null
let stopped = true
let lastExpiresAt: number | null = null
let refreshPromise: Promise<RefreshOutcome> | null = null
let transientFailures = 0
let visibilityBound = false
let onlineBound = false

function apiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function randomLeadMs(): number {
  return LEAD_MIN_MS + Math.floor(Math.random() * (LEAD_MAX_MS - LEAD_MIN_MS))
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function postRefresh(
  reason: 'proactive' | 'visibility' | 'online' | 'fallback'
): Promise<RefreshOutcome> {
  if (stopped) return { ok: false, reason: 'logged_out' }

  try {
    const res = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'Supplify',
        'X-Auth-Refresh-Reason': reason === 'proactive' ? 'proactive' : reason,
      },
    })

    let json: {
      ok?: boolean
      data?: { accessTokenExpiresAt?: number | null; expires_in?: number | null }
      error?: { name?: string; message?: string }
    } | null = null
    try {
      json = await res.json()
    } catch {
      json = null
    }

    if (res.status === 503 || json?.error?.name === 'AUTH_TEMPORARILY_UNAVAILABLE') {
      transientFailures += 1
      return { ok: false, reason: 'transient' }
    }

    if (
      res.status === 401 ||
      json?.error?.name === 'UNAUTHORIZED' ||
      json?.error?.name === 'JWT_EXPIRED'
    ) {
      transientFailures = 0
      return { ok: false, reason: 'invalid' }
    }

    if (!res.ok || !json?.ok) {
      transientFailures += 1
      return { ok: false, reason: 'transient' }
    }

    transientFailures = 0
    const expiresAt =
      typeof json.data?.accessTokenExpiresAt === 'number'
        ? json.data.accessTokenExpiresAt
        : typeof json.data?.expires_in === 'number'
          ? Date.now() + json.data.expires_in * 1000
          : null

    return {
      ok: true,
      data: {
        accessTokenExpiresAt: expiresAt,
        expires_in: json.data?.expires_in ?? null,
      },
    }
  } catch {
    transientFailures += 1
    return { ok: false, reason: 'transient' }
  }
}

/** Single-flight refresh shared by scheduler and API 401 fallback. */
export function refreshAuthSession(
  reason: 'proactive' | 'visibility' | 'online' | 'fallback' = 'fallback'
): Promise<RefreshOutcome> {
  if (stopped) return Promise.resolve({ ok: false, reason: 'logged_out' })
  if (refreshPromise) return refreshPromise

  refreshPromise = postRefresh(reason).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

function scheduleNext(expiresAt: number | null) {
  clearTimer()
  if (stopped || !expiresAt) return

  lastExpiresAt = expiresAt
  const lead = randomLeadMs()
  const delay = Math.max(MIN_DELAY_MS, expiresAt - Date.now() - lead - SKEW_MS)

  timer = setTimeout(() => {
    void (async () => {
      const outcome = await refreshAuthSession('proactive')
      if (outcome.ok) {
        scheduleNext(outcome.data.accessTokenExpiresAt)
        return
      }
      if (outcome.reason === 'transient' && transientFailures <= MAX_TRANSIENT_RETRIES) {
        // Retry with backoff; do not treat as logout
        timer = setTimeout(
          () => {
            void refreshAuthSession('proactive').then((retry) => {
              if (retry.ok) scheduleNext(retry.data.accessTokenExpiresAt)
              else if (retry.reason === 'transient') scheduleNext(Date.now() + 60_000)
            })
          },
          Math.min(60_000, 5_000 * transientFailures)
        )
        return
      }
      if (outcome.reason === 'invalid') {
        stopAuthSessionRefresh()
      }
    })()
  }, delay)
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || stopped) return
  if (!lastExpiresAt) return
  if (lastExpiresAt - Date.now() > LEAD_MAX_MS + SKEW_MS) return
  void refreshAuthSession('visibility').then((outcome) => {
    if (outcome.ok) scheduleNext(outcome.data.accessTokenExpiresAt)
  })
}

function onOnline() {
  if (stopped) return
  void refreshAuthSession('online').then((outcome) => {
    if (outcome.ok) scheduleNext(outcome.data.accessTokenExpiresAt)
    else if (outcome.reason === 'transient') {
      // Keep UI authenticated; retry shortly
      scheduleNext(Date.now() + 30_000)
    }
  })
}

function bindLifecycle() {
  if (typeof window === 'undefined') return
  if (!visibilityBound) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    visibilityBound = true
  }
  if (!onlineBound) {
    window.addEventListener('online', onOnline)
    onlineBound = true
  }
}

/**
 * Start proactive refresh from /auth/me (or session) metadata.
 * @param accessTokenExpiresAt ms epoch from server
 * @param enabled server/feature flag
 */
export function startAuthSessionRefresh(
  accessTokenExpiresAt: number | null | undefined,
  enabled = true
) {
  if (!enabled) {
    stopAuthSessionRefresh()
    return
  }
  stopped = false
  bindLifecycle()
  if (typeof accessTokenExpiresAt === 'number' && accessTokenExpiresAt > 0) {
    scheduleNext(accessTokenExpiresAt)
  }
}

export function stopAuthSessionRefresh() {
  stopped = true
  clearTimer()
  lastExpiresAt = null
  transientFailures = 0
  refreshPromise = null
}

/** @internal tests */
export function getAuthSessionRefreshStateForTests() {
  return {
    stopped,
    lastExpiresAt,
    hasTimer: Boolean(timer),
    hasInflight: Boolean(refreshPromise),
    transientFailures,
  }
}

/** @internal tests */
export function resetAuthSessionRefreshForTests() {
  stopAuthSessionRefresh()
  if (typeof window !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
  }
  visibilityBound = false
  onlineBound = false
}
