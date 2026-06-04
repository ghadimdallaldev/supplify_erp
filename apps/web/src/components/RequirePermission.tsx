import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

type Props = {
  permission?: string
  anyOf?: readonly string[]
  title?: string
  children: ReactNode
}

/** Blocks direct URL access when the user lacks view permission for a page. */
export function RequirePermission({ permission, anyOf, title, children }: Props) {
  const { can, canAny } = usePermissions()
  const allowed = anyOf?.length ? canAny(...anyOf) : permission ? can(permission) : true

  if (allowed) return <>{children}</>

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6" role="alert">
      <Card className="w-full max-w-md border-[var(--app-border)]">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--text-mid)]">
            <ShieldOff className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <CardTitle className="text-[var(--text)]">Access restricted</CardTitle>
          </div>
          <CardDescription className="text-[var(--text-muted)]">
            You don&apos;t have permission to view {title ?? 'this page'}. Your role is read-only or
            limited for this area — contact a workspace admin if you need access.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
