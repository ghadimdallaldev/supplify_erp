import { useEffect, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGetMeQuery } from '../services/api'
import { needsLegalReacceptance } from '../lib/legalReacceptanceGate'

interface StaffPortalGuardProps {
  children: ReactNode
}

/**
 * Staff dashboard: Keycloak session (STAFF_PORTAL) or legacy magic-link token.
 */
export function StaffPortalGuard({ children }: StaffPortalGuardProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const {
    data: me,
    isLoading,
    error,
  } = useGetMeQuery(undefined, {
    skip: Boolean(token),
    refetchOnMountOrArgChange: true,
  })

  useEffect(() => {
    if (token) return
    if (isLoading) return
    if (error || !me) {
      navigate('/staff/login', { replace: true })
      return
    }
    if (needsLegalReacceptance(me)) {
      navigate('/legal/reaccept', { replace: true })
      return
    }
    if (me.role !== 'STAFF_PORTAL' && me.accessType !== 'staff_portal' && !me.staffPortal) {
      navigate('/app', { replace: true })
    }
  }, [token, isLoading, error, me, navigate])

  if (token) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white" />
      </div>
    )
  }

  if (error || !me) {
    return null
  }

  return <>{children}</>
}
