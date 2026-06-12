import { useEffect, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Skeleton } from './ui/skeleton'
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
      <div
        className="min-h-dvh bg-[var(--brand-ultra)] px-4 py-8 pwa-safe-top pwa-safe-bottom"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !me) {
    return null
  }

  return <>{children}</>
}
