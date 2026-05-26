import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { usePermissions } from '../hooks/usePermissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

type Props = {
  permission?: string
  anyOf?: string[]
  title?: string
  children: ReactNode
}

/** Blocks direct URL access when the user lacks view permission for a page. */
export function RequirePermission({ permission, anyOf, title, children }: Props) {
  const { can, canAny } = usePermissions()
  const allowed = anyOf?.length ? canAny(...anyOf) : permission ? can(permission) : true

  if (allowed) return <>{children}</>

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldOff className="h-5 w-5" />
            <CardTitle>Access denied</CardTitle>
          </div>
          <CardDescription>
            You do not have permission to view {title ?? 'this page'}. Contact your workspace admin
            if you need access.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
