import type { ReactNode } from 'react'
import { usePermissions } from '../hooks/usePermissions'

type Props = {
  /** Single permission key */
  permission?: string
  /** Any one of these permissions grants access */
  anyOf?: string[]
  children: ReactNode
  fallback?: ReactNode
}

export function PermissionGate({ permission, anyOf, children, fallback = null }: Props) {
  const { can, canAny } = usePermissions()
  const allowed = anyOf?.length ? canAny(...anyOf) : permission ? can(permission) : true
  if (!allowed) return <>{fallback}</>
  return <>{children}</>
}
