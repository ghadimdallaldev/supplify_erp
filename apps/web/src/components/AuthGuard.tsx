import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGetMeQuery } from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import { setUser, clearUser, setLoading } from '../features/auth/authSlice'
import type { ReactNode } from 'react'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  // Disable refetch on mount/focus to reduce requests, only fetch once
  const { data, error, isLoading } = useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: true, // Only refetch on reconnect
  })

  useEffect(() => {
    if (isLoading) {
      dispatch(setLoading(true))
    } else if (error) {
      dispatch(clearUser())
      dispatch(setLoading(false))
      navigate('/login')
    } else if (data) {
      dispatch(setUser(data))
      dispatch(setLoading(false))
    }
  }, [data, error, isLoading, dispatch, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return null
  }

  return <>{children}</>
}
