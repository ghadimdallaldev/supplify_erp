import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGetMeQuery, useGetRegisterStatusQuery } from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import { setUser, clearUser, setLoading } from '../features/auth/authSlice'
import { refetchAppSession, hasStaleRegistrationState } from '../lib/refetchAppSession'
import { needsLegalReacceptance } from '../lib/legalReacceptanceGate'
import { getRegisterCompletePath } from '../lib/referralToken'
import { loginPathWithReturnTo } from '../lib/returnTo'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { applyAdminPreferences, clearAdminPreferences } from '../lib/adminPreferences'
import { changeAppLanguage, readStoredLocale } from '../i18n'
import { isSupportedLocale } from '../i18n/config'
import { startAuthSessionRefresh, stopAuthSessionRefresh } from '../lib/authSessionRefresh'
import type { ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
}

function isAppShellRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/app')
}

/** Only an explicit auth rejection means "signed out"; network/5xx errors are transient. */
function isAuthRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status
  return status === 401 || status === 403
}

export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const redirectedToRegister = useRef(false)
  const isAppRoute = isAppShellRoute(location.pathname)
  const onLegalReacceptPage = location.pathname === '/legal/reaccept'

  const { t } = useTranslation()
  const { data, error, isLoading, refetch } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: true,
  })
  const needsLegalReacceptanceGate =
    isAppRoute && needsLegalReacceptance(data) && !onLegalReacceptPage

  const { data: registerStatus, isLoading: registerStatusLoading } = useGetRegisterStatusQuery(
    undefined,
    {
      skip: !data || !isAppRoute,
      refetchOnMountOrArgChange: false,
      refetchOnFocus: false,
    }
  )

  // Prefer API needsSetup (workspace membership aware). PENDING alone is not enough —
  // invited staff can briefly show stale PENDING while membership already exists.
  const needsRegister =
    isAppRoute &&
    data &&
    data.role !== 'ADMIN' &&
    (registerStatus?.needsSetup === true ||
      (data.role === 'PENDING' && registerStatus?.needsSetup !== false))

  const staleRegistrationState =
    isAppRoute &&
    data &&
    hasStaleRegistrationState({ role: data.role, needsSetup: registerStatus?.needsSetup })

  useEffect(() => {
    if (staleRegistrationState) {
      void refetchAppSession(dispatch)
    }
  }, [staleRegistrationState, dispatch])

  useEffect(() => {
    if (data?.role === 'ADMIN' && data.adminPreferences) {
      applyAdminPreferences(data.adminPreferences)
      return
    }
    if (data && data.role !== 'ADMIN') {
      clearAdminPreferences()
    }
  }, [data])

  useEffect(() => {
    const preferred = data?.preferredLocale
    if (!preferred || !isSupportedLocale(preferred)) return
    if (readStoredLocale() !== preferred) {
      void changeAppLanguage(preferred, { skipServerSync: true })
    }
  }, [data?.preferredLocale])

  useEffect(() => {
    if (isLoading) {
      dispatch(setLoading(true))
      return
    }
    if (error && isAuthRejection(error)) {
      stopAuthSessionRefresh()
      dispatch(clearUser())
      dispatch(setLoading(false))
      navigate(loginPathWithReturnTo(`${location.pathname}${location.search}${location.hash}`))
      return
    }
    if (!data) {
      // Transient failure (network / 5xx) with no session data: keep the user, show retry UI.
      if (error) dispatch(setLoading(false))
      return
    }

    dispatch(setUser(data))
    dispatch(setLoading(false))
    startAuthSessionRefresh(
      data.accessTokenExpiresAt ?? null,
      data.proactiveRefreshEnabled !== false
    )

    if (data.role === 'STAFF_PORTAL' && isAppRoute) {
      navigate('/staff/dashboard', { replace: true })
      return
    }

    if (data.role === 'CONSUMER' && isAppRoute) {
      navigate('/shop', { replace: true })
      return
    }

    if (needsLegalReacceptanceGate) {
      navigate('/legal/reaccept', { replace: true })
      return
    }

    if (!needsRegister) {
      redirectedToRegister.current = false
      return
    }

    if (!redirectedToRegister.current) {
      redirectedToRegister.current = true
      navigate(getRegisterCompletePath(), { replace: true })
    }
  }, [
    data,
    error,
    isLoading,
    needsRegister,
    needsLegalReacceptanceGate,
    dispatch,
    navigate,
    isAppRoute,
    location.pathname,
    location.search,
    location.hash,
  ])

  if (!isAppRoute) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-full max-w-md space-y-4 px-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
    )
  }

  if (error && isAuthRejection(error)) {
    return null
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-full max-w-md space-y-4 px-6 text-center" role="alert">
          <h1 className="text-lg font-semibold text-[var(--text)]">{t('sessionError.title')}</h1>
          <p className="text-sm text-[var(--text-muted)]">{t('sessionError.message')}</p>
          <Button type="button" onClick={() => void refetch()}>
            {t('sessionError.retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (data?.role === 'PENDING' && registerStatusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-full max-w-md space-y-4 px-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
    )
  }

  if (needsRegister || needsLegalReacceptanceGate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-full max-w-md space-y-4 px-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
    )
  }

  if (data?.role === 'CONSUMER' && isAppRoute) {
    return null
  }

  return <>{children}</>
}
