import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGetMeQuery } from '../../services/api'
import { useAppDispatch } from '../../hooks/redux'
import { setUser, clearUser, setLoading } from '../../features/auth/authSlice'
import toast from 'react-hot-toast'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data, error, isLoading } = useGetMeQuery()

  useEffect(() => {
    if (isLoading) {
      dispatch(setLoading(true))
    } else if (error) {
      dispatch(clearUser())
      dispatch(setLoading(false))
      navigate('/login')
    } else if (data) {
      dispatch(setUser(data.user))
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
