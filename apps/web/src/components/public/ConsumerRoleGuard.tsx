import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '../../hooks/redux'
import { AuthGuard } from '../AuthGuard'

function ConsumerOnly({ children }: { children: ReactNode }) {
  const user = useAppSelector((state) => state.auth.user)
  if (!user) return null
  if (user.role !== 'CONSUMER') return <Navigate to="/app" replace />
  return <>{children}</>
}

export function ConsumerRoleGuard({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <ConsumerOnly>{children}</ConsumerOnly>
    </AuthGuard>
  )
}
