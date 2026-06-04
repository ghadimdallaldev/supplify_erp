import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGetMeQuery, useGetRegisterStatusQuery } from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import { setUser, clearUser, setLoading } from '../features/auth/authSlice'
import { refetchAppSession, hasStaleRegistrationState } from '../lib/refetchAppSession'
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

  const { data, error, isLoading } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: true,
  })
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

    if (!needsRegister) {
      redirectedToRegister.current = false
      return
    }

    if (!redirectedToRegister.current) {
      redirectedToRegister.current = true
      navigate('/register/complete', { replace: true })
    }
  }, [data, error, isLoading, needsRegister, dispatch, navigate])

  if (!isAppRoute) {
    return <>{children}</>
  }

  if (isLoading || (data?.role !== 'PENDING' && registerStatusLoading && !registerStatus)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]" />
      </div>
    )
  }

  if (error) {
    return null
  }

  if (needsRegister) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]" />
      </div>
    )
  }

  return <>{children}</>
}
