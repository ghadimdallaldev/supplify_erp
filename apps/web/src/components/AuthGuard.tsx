import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGetMeQuery, useGetRegisterStatusQuery } from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import { setUser, clearUser, setLoading } from '../features/auth/authSlice'
import { refetchAppSession, hasStaleRegistrationState } from '../lib/refetchAppSession'
import { needsLegalReacceptance } from '../lib/legalReacceptanceGate'
import { getRegisterCompletePath } from '../lib/referralToken'
import { applyAdminPreferences, clearAdminPreferences } from '../lib/adminPreferences'
import type { ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
}

function isAppShellRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/app')
}

export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const redirectedToRegister = useRef(false)
  const isAppRoute = isAppShellRoute(location.pathname)
  const onLegalReacceptPage = location.pathname === '/legal/reaccept'

  const { data, error, isLoading } = useGetMeQuery(undefined, {
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

  const needsRegister =
    isAppRoute &&
    data &&
    (data.role === 'PENDING' || (registerStatus?.needsSetup === true && data.role !== 'ADMIN'))

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
  }, [data?.role, data?.adminPreferences])

  useEffect(() => {
    if (isLoading) {
      dispatch(setLoading(true))
      return
    }
    if (error) {
      dispatch(clearUser())
      dispatch(setLoading(false))
      navigate('/login')
      return
    }
    if (!data) return

    dispatch(setUser(data))
    dispatch(setLoading(false))

    if (data.role === 'STAFF_PORTAL' && isAppRoute) {
      navigate('/staff/dashboard', { replace: true })
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

  if (error) {
    return null
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

  return <>{children}</>
}
